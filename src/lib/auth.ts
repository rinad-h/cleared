import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db";
import * as authSchema from "@/db/auth-schema";
import { DisplayName, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/schemas/identity";
import { getEnv } from "@/lib/env";
import { log } from "@/server/log";
import type { SessionUser } from "@/server/services/me";

/** Sign-in and sign-up attempts per minute per IP (FR-19, auth part). */
const AUTH_LIMITS = {
  production: { signIn: 5, signUp: 3 },
  // E2E creates many accounts from one IP (technologies.md §10, §16).
  test: { signIn: 1000, signUp: 1000 },
} as const;

/**
 * Better Auth's messages are mostly constants, but a few interpolate an email
 * (e.g. "Sign-up attempt for existing email: …"). Strip anything that looks
 * like an email or URL before it reaches Workers Logs (AGENTS.md rule 13).
 */
export function scrubAuthLogMessage(message: string): string {
  return message
    .replace(/\S+@\S+/g, "[email]")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[url]")
    .slice(0, 200);
}

/**
 * Better Auth, configured as in technologies.md §6.3. A new instance per
 * request: it reads this request's vars and secrets through `getEnv()` (so the
 * E2E overrides apply) and binds this request's D1.
 *
 * Password hashing is Better Auth's default scrypt, which on Workers already
 * runs on native `node:crypto` (Phase 1 P1-01, D2). No email is ever sent: no
 * verification and no reset emails (technologies.md §7).
 */
export function getAuth() {
  const env = getEnv();
  const limits = env.ENVIRONMENT === "test" ? AUTH_LIMITS.test : AUTH_LIMITS.production;

  return betterAuth({
    appName: "Cleared",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), { provider: "sqlite", schema: authSchema }),
    trustedOrigins: [env.PUBLIC_BASE_URL],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      // Signed in straight after sign-up: nothing is verified (Phase 1 D1).
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days: students stay signed in on their phone
      updateAge: 60 * 60 * 24,
      // Skips the session read on most requests. Our `members` row is still read
      // on every request, so suspension applies immediately (Phase 1 D4).
      cookieCache: { enabled: true, maxAge: 300 },
    },
    rateLimit: {
      enabled: true,
      storage: "database", // shared across Worker isolates (memory isn't)
      customRules: {
        "/sign-in/email": { window: 60, max: limits.signIn },
        "/sign-up/email": { window: 60, max: limits.signUp },
      },
    },
    // The display name is copied onto passes and member lists: same rule as the
    // sign-up form (1–80 characters, no control characters).
    databaseHooks: {
      user: {
        create: {
          before: async (newUser) => {
            const name = DisplayName.safeParse(newUser.name);
            if (!name.success) {
              throw new APIError("BAD_REQUEST", { message: "Enter a name of 1–80 characters." });
            }
            return { data: { ...newUser, name: name.data } };
          },
        },
      },
    },
    // Not used by Cleared. `/update-user` would let people rename their Better
    // Auth user, which Cleared never reads after joining (Phase 1 Q1).
    disabledPaths: ["/update-user"],
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    telemetry: { enabled: false },
    logger: {
      level: "warn",
      log: (level, message, ...args) => {
        const err = args.find((a) => a instanceof Error);
        log(level, "auth.better_auth", { summary: scrubAuthLogMessage(String(message)) }, err);
      },
    },
    plugins: [nextCookies()], // must stay last
  });
}

/**
 * The signed-in user for this request, or null. Uses the signed cookie cache
 * (5 min) or one D1 read. Call it inside `<Suspense>` (AGENTS.md rule 4).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Read the request first: creating Better Auth uses Math.random(), which dev's
  // Cache Components only allows after a dynamic access.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
});
