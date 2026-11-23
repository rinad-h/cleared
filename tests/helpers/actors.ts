/**
 * Actor builders: `actors.admin()`, `actors.staff()`, `actors.member({ status })`,
 * `actors.nonMember()`, `actors.anonymous()`. Each inserts the Better Auth `user`
 * and the `members` row, then returns an `Actor` to pass to services.
 *
 * Phase 0 placeholder: implemented in Phase 1 with the `members` table.
 */
import type { Actor } from "@/server/domain/actor";

export const actors = {
  anonymous: (): Actor => ({ kind: "anonymous" }),
};
