"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the current page on the server every `seconds` while the tab is
 * visible. While hidden it pauses; on becoming visible it refreshes as soon as
 * a full interval has passed since the last refresh (right away if it already
 * has), so the gap never exceeds one interval of visible time.
 *
 * Each refresh is a full server render, so use it only where the PRD asks for
 * it (the pass page, every 60 s). Polling screens use `usePoll` instead
 * (technologies.md §5.2).
 */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const intervalMs = Math.max(1, seconds) * 1000;
    let last = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const arm = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(tick, delay);
    };
    function tick() {
      last = Date.now();
      router.refresh();
      arm(intervalMs);
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") arm(Math.max(0, last + intervalMs - Date.now()));
      else clearTimeout(timer);
    };

    if (document.visibilityState === "visible") arm(intervalMs);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, seconds]);

  return null;
}
