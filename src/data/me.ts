import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import { getSessionUser } from "@/lib/auth";
import * as me from "@/server/services/me";

/**
 * Who is signed in, whether Setup ran, and their membership (layouts and gates).
 * Cached per request (React `cache`, like `getActor()`): the header, the demo
 * banner and the page's <Gate> all call it, and share one settings read.
 */
export const getMe = cache(async (): Promise<me.Me> => {
  const [actor, sessionUser] = await Promise.all([getActor(), getSessionUser()]);
  return me.getMe(getDb(), actor, sessionUser);
});

/**
 * The makerspace's public details (name), or null before Setup. Reads no
 * session, so it marks the render dynamic itself: otherwise the production
 * build would try to prerender the page and query D1 at build time.
 */
export async function getMakerspace(): Promise<me.Makerspace | null> {
  await connection();
  return me.getMakerspace(getDb());
}
