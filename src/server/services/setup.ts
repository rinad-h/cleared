import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { members, settings, user } from "@/db/schema";
import { SetupInput } from "@/lib/schemas/identity";
import { requireUser } from "@/server/authz";
import type { Actor } from "@/server/domain/actor";
import { ServiceError } from "@/server/domain/errors";
import { newToken, toDisplayName } from "@/server/domain/identity";
import { parse } from "@/server/domain/parse";
import { SETTINGS_ID } from "@/server/version";

export async function isSetupComplete(db: Db): Promise<boolean> {
  const row = await db.select({ id: settings.id }).from(settings).where(eq(settings.id, SETTINGS_ID)).get();
  return row !== undefined;
}

const alreadyDone = () =>
  new ServiceError("SETUP_ALREADY_DONE", "This makerspace is already set up.");

/**
 * First-run Setup (FR-01): creates the settings row and makes the caller the
 * first admin, in one batch. `settings.id = 'singleton'` is the primary key, so
 * of two concurrent setups exactly one batch commits; the other fails as a
 * whole and gets `SETUP_ALREADY_DONE`.
 */
export async function completeSetup(
  db: Db,
  actor: Actor,
  rawInput: SetupInput,
  now: number,
): Promise<{ memberId: string }> {
  requireUser(actor);
  const input = parse(SetupInput, rawInput);
  if (actor.kind === "member") throw alreadyDone();
  if (await isSetupComplete(db)) throw alreadyDone();

  const account = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, actor.userId))
    .get();
  if (!account) throw new ServiceError("UNAUTHENTICATED", "Sign in to continue.");

  const memberId = crypto.randomUUID();
  try {
    await db.batch([
      db.insert(settings).values({
        id: SETTINGS_ID,
        name: input.makerspaceName,
        timezone: input.timezone,
        memberJoinToken: newToken(),
        joinTokenRotatedAt: now,
        dataVersion: 1,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(members).values({
        id: memberId,
        authUserId: actor.userId,
        email: account.email,
        displayName: toDisplayName(account.name, account.email),
        role: "admin",
        status: "active",
        createdAt: now,
        updatedAt: now,
      }),
    ]);
  } catch (err) {
    // Lost the race: another Setup committed between the check above and this batch.
    if (await isSetupComplete(db)) throw alreadyDone();
    throw err;
  }
  return { memberId };
}
