import { Suspense } from "react";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { StatusBadge } from "@/components/status-badge";
import { getDb } from "@/db";
import { spikesEnabled } from "@/server/spikes/guard";
import { loadPassLikeData } from "@/server/spikes/data";

/**
 * TEMPORARY spike S2: a pass-like page (session read + 5 D1 queries + ~40 elements).
 * Call it 50 times (`node scripts/spike-load.mjs <url>`) and read `cpuTime` in Workers Logs.
 */
async function SpikePassContent() {
  await connection();
  // Outside development (unless ENABLE_SPIKES=1) this renders the not-found page before any data
  // is read. The page streams (Suspense, required under `next dev`), so the
  // status stays 200; the spike API routes answer a real 404.
  if (!spikesEnabled()) notFound();

  const session = (await cookies()).get("better-auth.session_token")?.value ?? null;
  const rows = await loadPassLikeData(getDb());

  return (
    <main id="main" className="mx-auto max-w-md space-y-4 px-4 py-6">
      <p className="text-sm text-muted-foreground">Spike S2 · pass-like</p>
      <h1 className="text-2xl font-semibold">Laser Cutter 2</h1>
      <StatusBadge status="cleared" size="lg" />
      <p>{session ? "Signed in" : "Not signed in"}</p>
      <section className="space-y-2">
        <h2 className="font-semibold">Requirements</h2>
        <ul className="space-y-2">
          {rows.map((n) => (
            <li key={n} className="flex items-center justify-between rounded-md border p-3">
              <span>Certification {n}</span>
              <StatusBadge status={n % 2 ? "cleared" : "supervision"} />
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Machine</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {["Room", "Status", "Session", "Next checkup", "Supervisor", "Training"].map((k) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd>—</dd>
            </div>
          ))}
        </dl>
      </section>
      <button type="button" className="w-full rounded-md bg-primary px-4 py-3 text-primary-foreground">
        Start session
      </button>
    </main>
  );
}

export default function SpikePassPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
      <SpikePassContent />
    </Suspense>
  );
}
