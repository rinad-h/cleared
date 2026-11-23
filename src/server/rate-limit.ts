import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ServiceError } from "@/server/domain/errors";
import { log } from "@/server/log";

/**
 * Per-member action limits (FR-19, Phase 6 §4.4): session starts, fault
 * reports and joins, 20 per 60 s per key. Keys use member / auth-user ids,
 * never IPs (campus Wi-Fi shares them, D4).
 *
 * Services take a `RateLimiter` as an option (dependency injection) and call
 * `enforceRateLimit()` after the actor is known and before any D1 read for the
 * action. Server actions pass `getRateLimiter()`; tests pass a fake.
 */
export interface RateLimiter {
  /** True if the action is allowed (and counted). */
  limit(key: string, now: number): Promise<boolean>;
}

export type RateLimitOptions = { limiter?: RateLimiter };

export type RateLimitKey = `start:${string}` | `fault:${string}` | `join:${string}`;

export const RATE_LIMITED_MESSAGE = "You're doing that too fast. Try again in a minute.";

/** Throw `RATE_LIMITED` when the limiter refuses. No limiter → no limit (services called directly in tests). */
export async function enforceRateLimit(limiter: RateLimiter | undefined, key: RateLimitKey, now: number): Promise<void> {
  if (!limiter) return;
  if (!(await limiter.limit(key, now))) {
    log("warn", "rate_limit.hit", { action: key.slice(0, key.indexOf(":")) });
    throw new ServiceError("RATE_LIMITED", RATE_LIMITED_MESSAGE);
  }
}

/**
 * The Workers Rate Limiting binding (`RL_ACTIONS`: 20 per 60 s, configured in
 * wrangler.jsonc). Counters are per Cloudflare location and best-effort, which
 * matches the PRD's "basic per-instance limit" (technologies.md §4.4).
 */
export function bindingLimiter(binding: RateLimit): RateLimiter {
  return {
    async limit(key) {
      const { success } = await binding.limit({ key });
      return success;
    },
  };
}

let warned = false;

/** The production limiter for this request. Without the binding it allows everything and logs once. */
export function getRateLimiter(): RateLimiter | undefined {
  const binding = (getCloudflareContext().env as Partial<CloudflareEnv>).RL_ACTIONS;
  if (binding) return bindingLimiter(binding);
  if (!warned) {
    warned = true;
    log("warn", "rate_limit.binding_missing", {});
  }
  return undefined;
}
