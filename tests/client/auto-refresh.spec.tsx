import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { AutoRefresh } = await import("@/components/auto-refresh");

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility("visible");
  refresh.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AutoRefresh", () => {
  it("refreshes every interval while visible", () => {
    render(<AutoRefresh seconds={60} />);
    vi.advanceTimersByTime(59_000);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("pauses while hidden and catches up with only the remaining time", () => {
    render(<AutoRefresh seconds={60} />);
    vi.advanceTimersByTime(30_000);
    setVisibility("hidden");
    vi.advanceTimersByTime(10_000);
    setVisibility("visible"); // 40 s since the last refresh
    vi.advanceTimersByTime(19_000);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000); // 60 s, not 100 s
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes right away when visible again after a full interval", () => {
    render(<AutoRefresh seconds={60} />);
    setVisibility("hidden");
    vi.advanceTimersByTime(5 * 60_000);
    expect(refresh).not.toHaveBeenCalled();
    setVisibility("visible");
    vi.advanceTimersByTime(0);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stops on unmount and clamps a zero interval", () => {
    const { unmount } = render(<AutoRefresh seconds={0} />);
    vi.advanceTimersByTime(999);
    expect(refresh).not.toHaveBeenCalled();
    unmount();
    vi.advanceTimersByTime(60_000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
