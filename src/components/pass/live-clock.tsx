"use client";

import { useEffect, useState } from "react";
import { formatClock, formatWeekday } from "@/lib/format";

/**
 * The pass's live clock (Phase 3 §6.1, anti-screenshot): server time in the
 * makerspace's time zone, ticking every second with a pulsing dot. The offset
 * from the device clock is measured when it mounts (and again after each
 * refresh), so a wrong phone clock doesn't matter. A static screenshot is
 * obvious because the seconds don't move. Reduced motion: no pulse, the
 * seconds still tick.
 */
export function LiveClock({ serverNow, timeZone }: { serverNow: string; timeZone: string }) {
  const serverMs = Date.parse(serverNow);
  const [now, setNow] = useState(serverMs);

  useEffect(() => {
    const offset = serverMs - Date.now();
    const tick = () => setNow(Date.now() + offset);
    const timer = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [serverMs]);

  return (
    <p className="flex items-center gap-3 text-2xl font-semibold tabular-nums" data-testid="live-clock">
      <span aria-hidden="true" className="relative flex size-3">
        <span className="absolute inline-flex size-full rounded-full bg-status-cleared-foreground opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex size-3 rounded-full bg-status-cleared-foreground" />
      </span>
      {/* Server and browser may format the time slightly differently (ICU data), and it changes every second. */}
      <time dateTime={new Date(now).toISOString()} suppressHydrationWarning>
        {formatClock(now, timeZone)}
      </time>
      <span className="text-base font-normal text-muted-foreground" suppressHydrationWarning>
        {formatWeekday(now, timeZone)}
      </span>
    </p>
  );
}
