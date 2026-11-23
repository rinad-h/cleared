import { Suspense } from "react";
import type { Metadata } from "next";
import { StatusBoard } from "@/components/board/status-board";
import { Gate } from "@/components/gate";
import { Skeleton } from "@/components/ui/skeleton";
import { getStatusBoard } from "@/data/board";

export const metadata: Metadata = { title: "Machines" };

/**
 * The member home: the status board (Phase 4 §6.2). The server renders the
 * first board, so the first paint has data; `<StatusBoard>` then polls the
 * JSON route handler (not `router.refresh()`, D6).
 */
export default function MachinesPage() {
  return (
    <Gate area="member">
      <section aria-labelledby="page-title" className="space-y-4 py-2">
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
          Machines
        </h1>
        <Suspense fallback={<BoardSkeleton />}>
          <Board />
        </Suspense>
      </section>
    </Gate>
  );
}

async function Board() {
  const { board, etag } = await getStatusBoard();
  return <StatusBoard initial={board} etag={etag} />;
}

function BoardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading machines" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}
