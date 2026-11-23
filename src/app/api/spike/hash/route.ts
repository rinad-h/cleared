import { connection } from "next/server";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { spikesEnabled } from "@/server/spikes/guard";

/**
 * TEMPORARY spike S1: Better Auth's default password hashing (scrypt) on Workers Free.
 * `?op=signup` hashes a password (sign-up / reset cost); `?op=signin` verifies one
 * (sign-in cost). Read `cpuTime` per request in Workers Logs or `wrangler tail`.
 * Uses the exact functions Better Auth calls, without needing its tables yet.
 */

// Hash of the fixed, public spike password below (generated with better-auth/crypto).
const SPIKE_PASSWORD = "spike-password-not-a-secret";
const SPIKE_HASH =
  "4da5036791475e10a44c8db945334160:ec9f34455afbc737c4db7d917fdecbc75496855ce8244b6954b642663f72732061773e2cf23b412921779394b92aea8049632cf3a2456dee75f25a7414224939";

export async function GET(request: Request): Promise<Response> {
  await connection();
  if (!spikesEnabled()) return new Response("Not found", { status: 404 });

  const op = new URL(request.url).searchParams.get("op") ?? "signup";
  const started = Date.now();
  if (op === "signin") {
    const ok = await verifyPassword({ hash: SPIKE_HASH, password: SPIKE_PASSWORD });
    return Response.json({ op, ok, wallMs: Date.now() - started });
  }
  await hashPassword(`${SPIKE_PASSWORD}-${crypto.randomUUID()}`);
  return Response.json({ op: "signup", ok: true, wallMs: Date.now() - started });
}
