"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export type PollOptions = {
  /** Poll interval while the viewer is active. */
  intervalMs?: number;
  /** Slower interval after `idleAfterMs` without interaction, and after errors (429/5xx/network). */
  idleIntervalMs?: number;
  idleAfterMs?: number;
  /** While false nothing is fetched or scheduled, and `refresh()` does nothing. */
  enabled?: boolean;
};

export type PollState<T> = {
  data: T | undefined;
  error: PollError | undefined;
  /** When the server last confirmed the data (200 or 304). */
  lastUpdated: Date | undefined;
  /** Poll now (no-op while disabled). Also resumes polling stopped by a 401/403. */
  refresh: () => void;
};

/** A failed poll. `status` is the HTTP status, or 0 for a network error. */
export class PollError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PollError";
    this.status = status;
  }
}

type Snapshot<T> = { url: string; data?: T; error?: PollError; lastUpdated?: Date };

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

/**
 * Poll a JSON route handler that supports ETags (status board, console home).
 *
 * - Sends `If-None-Match`; on 304 keeps the current data.
 * - Pauses while the tab is hidden. On becoming visible it polls right away
 *   only if the data is older than the interval.
 * - Backs off from `intervalMs` (30 s) to `idleIntervalMs` (120 s) after 10 min
 *   without interaction, and returns to 30 s as soon as the viewer interacts.
 * - Backs off to `idleIntervalMs` after 429/5xx/network errors (e.g. the daily
 *   limit) and stops on 401/403 until `refresh()`.
 * - Data from a previous `url` is never shown for a new one.
 *
 * Every poll is a Worker request, so these rules protect the daily quota
 * (technologies.md §13.3).
 */
export function usePoll<T>(
  url: string,
  {
    intervalMs = 30_000,
    idleIntervalMs = 120_000,
    idleAfterMs = 10 * 60_000,
    enabled = true,
  }: PollOptions = {},
): PollState<T> {
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({ url });

  // Latest options, read by the timer callbacks.
  const config = useRef({ url, enabled, intervalMs, idleIntervalMs, idleAfterMs });
  useLayoutEffect(() => {
    config.current = { url, enabled, intervalMs, idleIntervalMs, idleAfterMs };
  });

  const state = useRef({
    etag: null as string | null,
    lastActivity: 0,
    lastPolled: 0,
    stopped: false,
    slow: false,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    inFlight: null as AbortController | null,
  });

  const control = useMemo(() => {
    function schedule() {
      const s = state.current;
      const c = config.current;
      clearTimeout(s.timer);
      if (!c.enabled || s.stopped || document.visibilityState !== "visible") return;
      const now = Date.now();
      const slow = s.slow || now - s.lastActivity > c.idleAfterMs;
      const delay = Math.max(0, s.lastPolled + (slow ? c.idleIntervalMs : c.intervalMs) - now);
      s.timer = setTimeout(() => void poll(), delay);
    }

    async function poll() {
      const s = state.current;
      const c = config.current;
      if (!c.enabled) return;
      clearTimeout(s.timer);
      s.inFlight?.abort();
      const controller = new AbortController();
      s.inFlight = controller;
      const requestUrl = c.url;
      const update = (patch: Omit<Snapshot<T>, "url">) =>
        setSnapshot((prev) => ({ ...(prev.url === requestUrl ? prev : { url: requestUrl }), ...patch }));

      try {
        const headers: HeadersInit = { Accept: "application/json" };
        if (s.etag) headers["If-None-Match"] = s.etag;
        const res = await fetch(requestUrl, { headers, cache: "no-store", signal: controller.signal });
        if (res.status === 304) {
          s.slow = false;
          update({ lastUpdated: new Date(), error: undefined });
        } else if (res.ok) {
          const body = (await res.json()) as T;
          s.etag = res.headers.get("ETag");
          s.slow = false;
          update({ data: body, lastUpdated: new Date(), error: undefined });
        } else {
          if (res.status === 401 || res.status === 403) s.stopped = true;
          else s.slow = true;
          update({ error: new PollError(res.status, `Request failed (${res.status})`) });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        s.slow = true;
        update({ error: new PollError(0, err instanceof Error ? err.message : String(err)) });
      } finally {
        if (s.inFlight === controller) s.inFlight = null;
      }
      if (controller.signal.aborted) return;
      s.lastPolled = Date.now();
      schedule();
    }

    return { schedule, poll };
  }, []);

  useEffect(() => {
    const s = state.current;
    s.etag = null;
    s.lastPolled = 0;
    s.stopped = false;
    s.slow = false;
    const cleanup = () => {
      clearTimeout(s.timer);
      s.inFlight?.abort();
    };
    if (!enabled) return cleanup;

    s.lastActivity = Date.now();
    const onActivity = () => {
      const wasIdle = Date.now() - s.lastActivity > config.current.idleAfterMs;
      s.lastActivity = Date.now();
      if (wasIdle) control.schedule(); // back to the active interval right away
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        s.lastActivity = Date.now();
        control.schedule(); // polls now only if the data is stale
      } else {
        clearTimeout(s.timer);
      }
    };

    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    control.schedule(); // lastPolled = 0, so this polls immediately when visible

    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      cleanup();
    };
  }, [url, enabled, control]);

  const refresh = useCallback(() => {
    if (!config.current.enabled) return;
    state.current.stopped = false;
    state.current.lastActivity = Date.now();
    void control.poll();
  }, [control]);

  const current = snapshot.url === url ? snapshot : undefined;
  return { data: current?.data, error: current?.error, lastUpdated: current?.lastUpdated, refresh };
}
