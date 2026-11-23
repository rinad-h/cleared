import "server-only";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import { getEnv } from "@/lib/env";
import { joinUrl } from "@/server/domain/identity";
import * as settings from "@/server/services/settings";

export type SettingsView = {
  name: string;
  timezone: string;
  joinUrl: string;
  joinTokenRotatedAt: number;
};

/** Admin: settings with the join link, built from PUBLIC_BASE_URL only (AGENTS.md rule 12). */
export async function getSettings(): Promise<SettingsView> {
  const actor = await getActor(); // session first (dynamic access), then D1
  const row = await settings.getSettings(getDb(), actor);
  return {
    name: row.name,
    timezone: row.timezone,
    joinUrl: joinUrl(getEnv().PUBLIC_BASE_URL, row.joinToken),
    joinTokenRotatedAt: row.joinTokenRotatedAt,
  };
}
