"use server";

import { action } from "@/lib/server-action";
import { EndSessionInput, ExtendSessionInput, StartSessionInput } from "@/lib/schemas/sessions";
import { getRateLimiter } from "@/server/rate-limit";
import * as sessions from "@/server/services/sessions";

/**
 * Session actions (Phase 4 §5). Each refreshes the page in the same response,
 * so the pass shows the new state. Results carry no member identities.
 */

/** Idempotent on `clientRequestId`: a replay returns the same session with `created: false`. */
export const startSession = action(StartSessionInput, async (actor, input, now, db) => {
  const { session, created } = await sessions.startSession(db, actor, input, now, { limiter: getRateLimiter() });
  return { sessionId: session.id, expectedEndAt: session.expectedEndAt, created };
});

export const extendSession = action(ExtendSessionInput, async (actor, input, now, db) => {
  const { session } = await sessions.extendSession(db, actor, input, now);
  return { sessionId: session.id, expectedEndAt: session.expectedEndAt };
});

export const endSession = action(EndSessionInput, async (actor, input, now, db) => {
  const { session } = await sessions.endSession(db, actor, input, now);
  return { sessionId: session.id, endedAt: session.endedAt, endReason: session.endReason };
});
