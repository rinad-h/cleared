"use server";

import { action } from "@/lib/server-action";
import { NoInput, SettingsPatch } from "@/lib/schemas/identity";
import * as settings from "@/server/services/settings";

export const updateSettings = action(SettingsPatch, (actor, input, now, db) =>
  settings.updateSettings(db, actor, input, now),
);

export const regenerateJoinLink = action(NoInput, async (actor, _input, now, db) => {
  await settings.regenerateJoinLink(db, actor, {}, now);
});
