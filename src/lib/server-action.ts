import "server-only";
import type { z } from "zod";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, type Db } from "@/db";
import { getActor } from "@/lib/actor";
import { parse, run, type ActionResult } from "@/lib/action";
import type { Actor } from "@/server/domain/actor";

const WRAPPED = Symbol.for("cleared.action");
const SCHEMA = Symbol.for("cleared.action.schema");

type Handler<In, Out> = (actor: Actor, input: In, now: number, db: Db) => Promise<Out>;

type Options<Out> = {
  /** Where to go after success (default: refresh the current page in the same response). */
  redirectTo?: (result: Out) => string;
};

export type WrappedAction<Out> = ((input: FormData | Record<string, unknown>) => Promise<ActionResult<Out>>) & {
  readonly [WRAPPED]: true;
};

/**
 * The only way to write a server action (Phase 1 §4.4):
 * `getActor()` → `parse(schema, input)` → handler (a service call) inside
 * `run()` → `refresh()` or `redirect()`. Every permission check lives in the
 * service the handler calls.
 *
 * ```ts
 * "use server";
 * export const updateMember = action(MemberPatch, (actor, input, now, db) =>
 *   members.updateMember(db, actor, input, now));
 * ```
 *
 * The result carries a hidden marker; tests/unit/actions-wrapped.spec.ts
 * checks that every export of every module in src/actions/ has it.
 */
export function action<S extends z.ZodType, Out>(
  schema: S,
  handler: Handler<z.output<S>, Out>,
  options: Options<Out> = {},
): WrappedAction<Out> {
  const wrapped = async (input: FormData | Record<string, unknown>): Promise<ActionResult<Out>> => {
    let destination: string | undefined;
    const result = await run(async () => {
      const actor = await getActor();
      const parsed = parse(schema, input);
      const out = await handler(actor, parsed, Date.now(), getDb());
      destination = options.redirectTo?.(out);
      return out;
    });
    if (!result.ok) return result;
    // Outside run(): redirect() throws on purpose.
    if (destination) redirect(destination);
    refresh();
    return result;
  };
  Object.defineProperty(wrapped, WRAPPED, { value: true });
  Object.defineProperty(wrapped, SCHEMA, { value: schema });
  return wrapped as WrappedAction<Out>;
}

/** The Zod schema an `action()` parses its input with (undefined for anything else). */
export function actionSchema(value: unknown): z.ZodType | undefined {
  return isWrappedAction(value) ? ((value as unknown as Record<symbol, unknown>)[SCHEMA] as z.ZodType) : undefined;
}

/** True if `value` was created by `action()`. */
export function isWrappedAction(value: unknown): boolean {
  return typeof value === "function" && (value as unknown as Record<symbol, unknown>)[WRAPPED] === true;
}
