import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePoll } from "@/components/use-poll";

const SEC = 1000;
const MIN = 60 * SEC;

type Reply = { status: number; body?: unknown; etag?: string };

let replies: Reply[];
let fetchMock: ReturnType<typeof vi.fn>;

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Run due timers (the first poll is a 0 ms timer) and let fetches and state updates settle. */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await flush();
}

const headersOf = (call: number) => fetchMock.mock.calls[call][1].headers as Record<string, string>;

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility("visible");
  replies = [];
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const reply = replies.shift() ?? { status: 304 };
    return new Response(reply.status === 304 ? null : JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: reply.etag ? { ETag: reply.etag } : {},
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("usePoll", () => {
  it("polls at once, sends If-None-Match, and keeps data on 304", async () => {
    replies.push({ status: 200, body: { n: 1 }, etag: '"a"' }, { status: 304 });
    const { result } = renderHook(() => usePoll<{ n: number }>("/api/board"));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(headersOf(0)["If-None-Match"]).toBeUndefined();
    expect(result.current.data).toEqual({ n: 1 });

    await advance(30 * SEC);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(headersOf(1)["If-None-Match"]).toBe('"a"');
    expect(result.current.data).toEqual({ n: 1 });
  });

  it("with server-rendered data and its ETag, shows it at once and first polls after one interval", async () => {
    replies.push({ status: 304 }, { status: 200, body: { n: 2 }, etag: '"b"' });
    const { result } = renderHook(() =>
      usePoll<{ n: number }>("/api/board", { initialData: { n: 1 }, initialEtag: '"a"' }),
    );
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({ n: 1 });

    await advance(30 * SEC);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(headersOf(0)["If-None-Match"]).toBe('"a"');
    expect(result.current.data).toEqual({ n: 1 });
    expect(result.current.lastUpdated).toBeInstanceOf(Date);

    await advance(30 * SEC);
    expect(result.current.data).toEqual({ n: 2 });
  });

  it("slows to 120 s after 10 min without interaction, and speeds up on activity", async () => {
    renderHook(() => usePoll("/api/board"));
    await flush();
    // Polls every 30 s up to 10:30; by then the viewer has been idle for more
    // than 10 min, so the next poll is 120 s later (12:30).
    await advance(10 * MIN + 30 * SEC);
    const afterTenMin = fetchMock.mock.calls.length;
    expect(afterTenMin).toBe(22);
    await advance(90 * SEC);
    expect(fetchMock).toHaveBeenCalledTimes(afterTenMin); // nothing at 11:00, 11:30, 12:00

    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(afterTenMin + 1); // overdue at the active interval: polls now
    await advance(30 * SEC);
    expect(fetchMock).toHaveBeenCalledTimes(afterTenMin + 2);
  });

  it("pauses while hidden and, when visible again, polls only if the data is stale", async () => {
    renderHook(() => usePoll("/api/board"));
    await flush();
    act(() => setVisibility("hidden"));
    await advance(5 * MIN);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => setVisibility("visible"));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2); // stale: polls right away

    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2); // fresh: a quick tab switch costs nothing
  });

  it("backs off after a 503 and stops after a 401 until refresh()", async () => {
    replies.push({ status: 503 });
    const { result } = renderHook(() => usePoll("/api/board"));
    await flush();
    expect(result.current.error?.status).toBe(503);
    await advance(60 * SEC);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 120 s after an error, not 30 s
    replies.push({ status: 401 });
    await advance(60 * SEC);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await advance(10 * MIN);
    expect(fetchMock).toHaveBeenCalledTimes(2); // stopped

    replies.push({ status: 200, body: { n: 2 } });
    act(() => result.current.refresh());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.error).toBeUndefined();
    expect(result.current.data).toEqual({ n: 2 });
  });

  it("does nothing while disabled, even if refresh() is called, and stops on unmount", async () => {
    const { result, unmount } = renderHook(() => usePoll("/api/board", { enabled: false }));
    act(() => result.current.refresh());
    await advance(10 * MIN);
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();

    const live = renderHook(() => usePoll("/api/board"));
    await flush();
    live.unmount();
    await advance(10 * MIN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never shows the previous url's data for a new url", async () => {
    replies.push({ status: 200, body: { room: "A" } });
    const { result, rerender } = renderHook(({ url }) => usePoll("" + url), { initialProps: { url: "/api/board?room=a" } });
    await flush();
    expect(result.current.data).toEqual({ room: "A" });

    replies.push({ status: 503 });
    rerender({ url: "/api/board?room=b" });
    expect(result.current.data).toBeUndefined();
    await flush();
    expect(result.current.data).toBeUndefined();
    expect(result.current.error?.status).toBe(503);
  });
});
