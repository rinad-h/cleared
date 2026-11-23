"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CircleCheck, CircleX, RefreshCw, TriangleAlert, WifiOff } from "lucide-react";
import { StatusBadge, type Status } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/input";
import { useLocalValue } from "@/components/use-local-value";
import { usePoll } from "@/components/use-poll";
import { formatTime, formatTimeOrDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BoardMachine, BoardTileState, StatusBoard as Board } from "@/server/domain/board";
import type { OutOfServiceReason } from "@/server/domain/enums";

const STATUS_OF: Record<BoardTileState, Status> = {
  available: "available",
  in_use: "in-use",
  out_of_service: "out-of-service",
};

const BAR: Record<BoardTileState, string> = {
  available: "border-l-status-cleared-foreground",
  in_use: "border-l-status-in-use-foreground",
  out_of_service: "border-l-status-out-of-service-foreground",
};

const OOS_REASONS: Record<OutOfServiceReason, string> = {
  issue_reported: "issue reported",
  maintenance: "maintenance",
  other: "other",
};

/** After this long without a successful check, the header says it's not updating. */
const STALE_MS = 2 * 60_000;
const ALL_ROOMS = "all";

/**
 * The member status board (Phase 4 §6.2). Starts from the server-rendered
 * board and polls `GET /api/status-board` every 30 s with its ETag (an
 * unchanged board costs a 304), only while the tab is visible. Filters are
 * client-side and remembered in this browser.
 */
export function StatusBoard({ initial, etag }: { initial: Board; etag: string }) {
  const { data, error, lastUpdated, refresh } = usePoll<Board>("/api/status-board", {
    initialData: initial,
    initialEtag: etag,
  });
  const board = data ?? initial;
  const tz = board.makerspace.timezone;
  const [room, setRoom] = useLocalValue("cleared.board.room", ALL_ROOMS);
  const [onlyMine, setOnlyMine] = useLocalValue("cleared.board.onlyCleared", "0");
  const now = useNow(15_000);

  const lastSuccess = lastUpdated?.getTime() ?? Date.parse(initial.generatedAt);
  const stale = now - lastSuccess > STALE_MS;
  const roomKnown = room === ALL_ROOMS || board.rooms.some((r) => r.id === room);
  const selectedRoom = roomKnown ? room : ALL_ROOMS;

  const rooms = useMemo(
    () =>
      board.rooms
        .filter((r) => selectedRoom === ALL_ROOMS || r.id === selectedRoom)
        .map((r) => ({ ...r, machines: onlyMine === "1" ? r.machines.filter((m) => m.clearedForMe) : r.machines }))
        .filter((r) => r.machines.length > 0),
    [board.rooms, selectedRoom, onlyMine],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-muted-foreground">{board.makerspace.name}</p>
        <p className="text-sm text-muted-foreground" aria-live="off">
          Updated <time suppressHydrationWarning>{formatTime(lastSuccess, tz)}</time>
        </p>
      </div>

      {error?.status === 503 ? (
        <Banner icon={TriangleAlert}>
          Cleared is over its free daily limit. The board is back after the daily reset (00:00 UTC).
        </Banner>
      ) : error && (error.status === 401 || error.status === 403) ? (
        <Banner icon={TriangleAlert}>
          Your access changed. <a href="/machines" className="underline underline-offset-4">Reload the page</a>.
        </Banner>
      ) : stale ? (
        <Banner icon={WifiOff}>
          Not updating. Check your connection.{" "}
          <Button type="button" size="sm" variant="outline" onClick={refresh} className="ml-1">
            <RefreshCw aria-hidden="true" />
            Retry
          </Button>
        </Banner>
      ) : null}

      {board.rooms.length === 0 ? (
        <p className="text-muted-foreground">No machines yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <div className="space-y-1">
              <Label htmlFor="board-room">Room</Label>
              <NativeSelect id="board-room" value={selectedRoom} onChange={(e) => setRoom(e.target.value)}>
                <option value={ALL_ROOMS}>All rooms</option>
                {board.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex min-h-11 items-center gap-2">
              <input
                id="board-only-cleared"
                type="checkbox"
                checked={onlyMine === "1"}
                onChange={(e) => setOnlyMine(e.target.checked ? "1" : "0")}
                className="size-5 accent-primary"
              />
              <Label htmlFor="board-only-cleared" className="font-normal">
                Only machines I&apos;m cleared for
              </Label>
            </div>
          </div>

          {rooms.length === 0 ? (
            onlyMine === "1" ? (
              <p className="text-muted-foreground">
                You&apos;re not cleared for any machines {selectedRoom === ALL_ROOMS ? "yet" : "in this room"}. See{" "}
                <Link href="/me/certifications" prefetch={false} className="underline underline-offset-4">
                  My certifications
                </Link>
                .
              </p>
            ) : (
              <p className="text-muted-foreground">No machines in this room.</p>
            )
          ) : (
            rooms.map((r) => (
              <section key={r.id} aria-labelledby={`room-${r.id}`} className="space-y-2">
                <h2 id={`room-${r.id}`} className="text-lg font-semibold">
                  {r.name}
                </h2>
                <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
                  {r.machines.map((m) => (
                    <li key={m.id}>
                      <MachineTile machine={m} tz={tz} now={now} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}

function Banner({ icon: Icon, children }: { icon: typeof WifiOff; children: React.ReactNode }) {
  return (
    <div role="status" className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/** One machine: colour bar + icon + WORD, name, ✔/✖ with text, estimate lines, badges. */
export function MachineTile({ machine: m, tz, now }: { machine: BoardMachine; tz: string; now: number }) {
  const time = (iso: string) => formatTimeOrDay(Date.parse(iso), now, tz);
  const details: string[] = [];
  if (m.inUse) details.push(`since ${time(m.inUse.since)}`, `est. free ${time(m.inUse.estFreeAt)}`);
  const oos = m.outOfService;
  const spokenState =
    m.state === "in_use" && m.inUse
      ? `in use, estimated free ${time(m.inUse.estFreeAt)}`
      : m.state === "out_of_service"
        ? "out of service"
        : "available";
  const name = `${m.name}, ${spokenState}, ${m.clearedForMe ? "you're cleared" : "not cleared"}`;

  return (
    <article
      aria-label={name}
      data-state={m.state}
      className={cn("h-full space-y-2 rounded-lg border border-l-8 bg-card p-3", BAR[m.state])}
    >
      <StatusBadge status={STATUS_OF[m.state]} className="uppercase" />
      <h3 className="font-semibold break-words">{m.name}</h3>
      <p className="flex items-center gap-1.5 text-sm">
        {m.clearedForMe ? (
          <>
            <CircleCheck aria-hidden="true" className="size-4 text-status-cleared-foreground" />
            You&apos;re cleared
          </>
        ) : (
          <>
            <CircleX aria-hidden="true" className="size-4 text-status-not-cleared-foreground" />
            Not cleared
          </>
        )}
      </p>
      {details.length > 0 ? (
        <p className="text-sm text-muted-foreground" suppressHydrationWarning>
          {details.join(" · ")}
        </p>
      ) : null}
      {oos ? (
        <div className="space-y-0.5 text-sm text-muted-foreground" suppressHydrationWarning>
          <p>
            since {time(oos.since)} · {OOS_REASONS[oos.reason]}
          </p>
          {oos.note ? <p className="break-words">&ldquo;{oos.note}&rdquo;</p> : null}
          {oos.expectedBackAt ? <p>expected back {time(oos.expectedBackAt)}</p> : null}
        </div>
      ) : null}
      {m.supervisionRequired || m.issueReported ? (
        <div className="flex flex-wrap gap-1.5">
          {m.supervisionRequired ? <StatusBadge status="supervision" /> : null}
          {m.issueReported ? (
            <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm">
              <TriangleAlert aria-hidden="true" className="size-4" />
              Issue reported (still usable)
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/** The current time, updated every `ms` (for "Not updating" and day-relative times). */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
