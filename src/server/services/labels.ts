import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { settings } from "@/db/schema";
import { LabelSheetInput } from "@/lib/schemas/catalog";
import { requireRole } from "@/server/authz";
import type { Actor } from "@/server/domain/actor";
import { ServiceError } from "@/server/domain/errors";
import { joinUrl } from "@/server/domain/identity";
import { parse } from "@/server/domain/parse";
import { SETTINGS_ID } from "@/server/version";
import { listMachines } from "./machines";

/** Where labels point. Always the configured PUBLIC_BASE_URL, never the request host (AGENTS.md rule 12). */
export type Site = { publicBaseUrl: string; environment: string };

export type Label = { machineId: string; machineName: string; roomName: string; url: string };
export type LabelSheet = {
  makerspaceName: string;
  environment: string;
  baseUrl: string;
  generatedAt: number;
  labels: Label[];
};

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** The URL printed on a machine's QR label. */
export function machineLabelUrl(publicBaseUrl: string, qrToken: string): string {
  return `${trimSlash(publicBaseUrl)}/m/${encodeURIComponent(qrToken)}`;
}

async function makerspace(db: Db) {
  const row = await db
    .select({ name: settings.name, joinToken: settings.memberJoinToken })
    .from(settings)
    .where(eq(settings.id, SETTINGS_ID))
    .get();
  if (!row) throw new ServiceError("SETUP_NOT_DONE", "This makerspace isn't set up yet.");
  return row;
}

/**
 * Staff: QR labels for every non-retired machine, or only `machineIds`.
 * All live machines are read (≤ 60) and filtered in memory, which is cheaper
 * than a large IN list. QR codes are drawn in the browser.
 */
export async function getLabelSheet(
  db: Db,
  actor: Actor,
  rawInput: { machineIds?: string | string[] },
  now: number,
  site: Site,
): Promise<LabelSheet> {
  requireRole(actor, "staff");
  const { machineIds } = parse(LabelSheetInput, rawInput);
  const [space, all] = await Promise.all([makerspace(db), listMachines(db, actor)]);
  const wanted = machineIds && machineIds.length > 0 ? new Set(machineIds) : null;
  const baseUrl = trimSlash(site.publicBaseUrl);
  return {
    makerspaceName: space.name,
    environment: site.environment,
    baseUrl,
    generatedAt: now,
    labels: all
      .filter((m) => !wanted || wanted.has(m.id))
      .map((m) => ({ machineId: m.id, machineName: m.name, roomName: m.room.name, url: machineLabelUrl(baseUrl, m.qrToken) })),
  };
}

export type DoorPoster = { makerspaceName: string; environment: string; baseUrl: string; boardUrl: string; joinUrl?: string };

/** Staff: the door poster (status board QR). Admins also get the join link (Phase 2 Q3). */
export async function getDoorPoster(db: Db, actor: Actor, site: Site): Promise<DoorPoster> {
  requireRole(actor, "staff");
  const space = await makerspace(db);
  const baseUrl = trimSlash(site.publicBaseUrl);
  return {
    makerspaceName: space.name,
    environment: site.environment,
    baseUrl,
    boardUrl: `${baseUrl}/machines`,
    ...(actor.role === "admin" ? { joinUrl: joinUrl(baseUrl, space.joinToken) } : {}),
  };
}
