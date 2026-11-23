import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, ClipboardPen } from "lucide-react";
import { CheckupBadge, dueText, intervalText, lastDoneText } from "@/components/checkups/checkup-parts";
import { Gate } from "@/components/gate";
import { Button } from "@/components/ui/button";
import { listDueCheckups } from "@/data/checkups";
import { DUE_FILTERS, type DueFilter } from "@/lib/schemas/checkups";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Checkups" };

const TABS: { value: DueFilter; label: string; empty: string }[] = [
  { value: "overdue", label: "Overdue", empty: "Nothing is overdue." },
  { value: "soon", label: "Due soon", empty: "Nothing is due in the next 7 days." },
  { value: "all", label: "All", empty: "No checkups yet. Add them from a machine's page." },
];

/**
 * Checkups across machines (FR-16, Phase 6 §6): Overdue (most overdue first),
 * Due soon (within 7 days, soonest first) or All. Advisory only. "Log checkup"
 * opens Log service with the type and checkup filled in.
 */
export default function ConsoleCheckupsPage({ searchParams }: PageProps<"/console/checkups">) {
  return (
    <Gate area="staff">
      <section aria-labelledby="page-title" className="max-w-3xl space-y-6">
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
          Checkups
        </h1>
        <Checkups searchParams={searchParams} />
      </section>
    </Gate>
  );
}

async function Checkups({ searchParams }: Pick<PageProps<"/console/checkups">, "searchParams">) {
  const query = await searchParams;
  const tab: DueFilter = DUE_FILTERS.find((f) => f === query.tab) ?? "overdue";
  const { items, now, timezone } = await listDueCheckups(tab);
  const current = TABS.find((t) => t.value === tab)!;

  return (
    <div className="space-y-4">
      <nav aria-label="Checkup lists" className="flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/console/checkups?tab=${t.value}`}
            prefetch={false}
            aria-current={t.value === tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              t.value === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="flex items-center gap-2 rounded-md border px-4 py-6 text-muted-foreground">
          <CircleCheck aria-hidden="true" className="size-5" />
          {current.empty}
        </p>
      ) : (
        <ul aria-label={`${current.label} checkups`} className="divide-y rounded-lg border">
          {items.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CheckupBadge state={c.state} />
                  <span className="font-medium break-words">{c.name}</span>
                </div>
                <p className="text-sm break-words">
                  <Link href={`/console/machines/${c.machine.id}`} prefetch={false} className="underline-offset-4 hover:underline">
                    {c.machine.name}
                  </Link>{" "}
                  <span className="text-muted-foreground">({c.machine.roomName})</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {intervalText(c.intervalDays)} · {lastDoneText(c.lastDoneAt, timezone)} ·{" "}
                  <span className={c.state === "overdue" ? "font-medium text-foreground" : undefined}>
                    {dueText(c.nextDueAt, now, timezone)}
                  </span>
                </p>
              </div>
              <Button asChild variant="outline" className="min-h-11 shrink-0">
                <Link href={`/console/machines/${c.machine.id}/service/new?checkupId=${c.id}`} prefetch={false}>
                  <ClipboardPen aria-hidden="true" />
                  Log checkup
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
