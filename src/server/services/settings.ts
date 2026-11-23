import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { settings } from "@/db/schema";
import { NoInput, SettingsPatch } from "@/lib/schemas/identity";
import { requireRole } from "@/server/authz";
import type { Actor } from "@/server/domain/actor";
import { ServiceError } from "@/server/domain/errors";
import { newToken } from "@/server/domain/identity";
import { parse } from "@/server/domain/parse";
import { SETTINGS_ID } from "@/server/version";

export type MakerspaceSettings = {
  name: string;
  timezone: string;
  joinToken: string;
  joinTokenRotatedAt: number;
  dataVersion: number;
};

const notSetUp = () => new ServiceError("SETUP_NOT_DONE", "This makerspace isn't set up yet.");

/** Admin: the makerspace settings, including the current join token. */
export async function getSettings(db: Db, actor: Actor): Promise<MakerspaceSettings> {
  requireRole(actor, "admin");
  const row = await db
    .select({
      name: settings.name,
      timezone: settings.timezone,
      joinToken: settings.memberJoinToken,
      joinTokenRotatedAt: settings.joinTokenRotatedAt,
      dataVersion: settings.dataVersion,
    })
    .from(settings)
    .where(eq(settings.id, SETTINGS_ID))
    .get();
  if (!row) throw notSetUp();
  return row;
}

/** Admin: rename the makerspace or change its time zone. Bumps `data_version`. */
export async function updateSettings(
  db: Db,
  actor: Actor,
  rawInput: SettingsPatch,
  now: number,
): Promise<void> {
  requireRole(actor, "admin");
  const input = parse(SettingsPatch, rawInput);
  if (input.name === undefined && input.timezone === undefined) {
    throw new ServiceError("VALIDATION_FAILED", "Nothing to change.");
  }
  const result = await db
    .update(settings)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      dataVersion: sql`${settings.dataVersion} + 1`,
      updatedAt: now,
    })
    .where(eq(settings.id, SETTINGS_ID))
    .run();
  if (result.meta.changes !== 1) throw notSetUp();
}

/** Admin: replace the join token. The old link stops working immediately. */
export async function regenerateJoinLink(
  db: Db,
  actor: Actor,
  rawInput: Record<string, never> = {},
  now: number,
): Promise<{ joinToken: string }> {
  requireRole(actor, "admin");
  parse(NoInput, rawInput);
  const joinToken = newToken();
  const result = await db
    .update(settings)
    .set({
      memberJoinToken: joinToken,
      joinTokenRotatedAt: now,
      dataVersion: sql`${settings.dataVersion} + 1`,
      updatedAt: now,
    })
    .where(eq(settings.id, SETTINGS_ID))
    .run();
  if (result.meta.changes !== 1) throw notSetUp();
  return { joinToken };
}
