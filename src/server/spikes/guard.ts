import "server-only";
import { getEnv } from "@/lib/env";

/**
 * TEMPORARY (Phase 0 platform spikes S1–S3). Delete `src/app/spike/`,
 * `src/app/api/spike/` and `src/server/spikes/` once the results are recorded
 * in docs/phases/phase-0-foundation.md §7.
 *
 * Spike routes exist only in development and on staging; production answers 404.
 */
export function spikesEnabled(): boolean {
  const environment = getEnv().ENVIRONMENT;
  return environment === "development" || environment === "staging";
}
