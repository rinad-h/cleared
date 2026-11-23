import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { StatusBadge, type Status } from "@/components/status-badge";
import { getDb } from "@/db";
import { spikesEnabled } from "@/server/spikes/guard";
import { loadPassLikeData } from "@/server/spikes/data";

/**
 * TEMPORARY spike S2: a board-like page with 60 machine tiles.
 * Call it 50 times (`node scripts/spike-load.mjs <url>`) and read `cpuTime` in Workers Logs.
 */
const CYCLE: Status[] = ["available", "in-use", "out-of-service"];

async function SpikeBoardContent() {
  await connection();
  // Outside development (unless ENABLE_SPIKES=1) this renders the not-found page before any data
  // is read. The page streams (Suspense, required under `next dev`), so the
  // status stays 200; the spike API routes answer a real 404.
  if (!spikesEnabled()) notFound();

  await loadPassLikeData(getDb());
  const machines = Array.from({ length: 60 }, (_, i) => ({
    id: i + 1,
    name: `Machine ${i + 1}`,
    room: `Room ${(i % 6) + 1}`,
    status: CYCLE[i % 3],
  }));

  return (
    <main id="main" className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <p className="text-sm text-muted-foreground">Spike S2 · board-like</p>
      <h1 className="text-2xl font-semibold">Machines</h1>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {machines.map((m) => (
          <li key={m.id} className="space-y-2 rounded-lg border p-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold">{m.name}</h2>
              <span className="text-sm text-muted-foreground">{m.room}</span>
            </div>
            <StatusBadge
              status={m.status}
              label={m.status === "in-use" ? "In use · est. free 3:10 pm" : undefined}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}

export default function SpikeBoardPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
      <SpikeBoardContent />
    </Suspense>
  );
}
