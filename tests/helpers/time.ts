/**
 * Services take `now` as an argument; tests pass explicit times.
 *   await services.startSession(db, actor, input, T0 + 15 * MIN)
 */
export const SECOND = 1_000;
export const MIN = 60 * SECOND;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** A fixed, readable starting instant: Monday 2026-01-05 16:00 UTC (9 am MST). */
export const T0 = Date.UTC(2026, 0, 5, 16, 0, 0);
