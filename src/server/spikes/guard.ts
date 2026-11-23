import "server-only";
import { getEnv } from "@/lib/env";

/**
 * TEMPORARY (Phase 0 platform spikes S1–S3). Delete `src/app/spike/`,
 * `src/app/api/spike/` and `src/server/spikes/` once the results are recorded
 * in docs/phases/phase-0-foundation.md §7.
 *
 * Spike routes exist in development. On the deployment (there is no staging)
 * they answer 404 unless the `ENABLE_SPIKES` Worker secret is "1": set it to
 * measure (`npm run remote -- secret put ENABLE_SPIKES`), delete it afterwards
 * (`npm run remote -- secret delete ENABLE_SPIKES`).
 */
export function spikesEnabled(): boolean {
  const env = getEnv();
  return env.ENVIRONMENT === "development" || env.ENABLE_SPIKES === "1";
}
