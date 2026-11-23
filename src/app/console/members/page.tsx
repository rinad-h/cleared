import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Gate } from "@/components/gate";
import { MemberFilters } from "@/components/members/member-filters";
import { MemberStatusLabel, ROLE_LABELS } from "@/components/members/member-status";
import { searchMembers } from "@/data/members";
import { MemberSearch } from "@/lib/schemas/identity";

export const metadata: Metadata = { title: "Members" };

export default function ConsoleMembersPage({ searchParams }: PageProps<"/console/members">) {
  return (
    <Gate area="staff">
      <section aria-labelledby="page-title" className="space-y-6">
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
          Members
        </h1>
        <MembersList searchParams={searchParams} />
      </section>
    </Gate>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function MembersList({ searchParams }: Pick<PageProps<"/console/members">, "searchParams">) {
  const params = await searchParams;
  const parsed = MemberSearch.safeParse({
    q: first(params.q),
    role: first(params.role),
    status: first(params.status),
    cursor: first(params.cursor),
  });
  // A hand-edited URL with bad filters just shows everyone.
  const input = parsed.success ? parsed.data : {};
  const { items, nextCursor } = await searchMembers(input);
  const filters = { q: parsed.success ? parsed.data.q : undefined, role: parsed.success ? parsed.data.role : undefined, status: parsed.success ? parsed.data.status : undefined };

  const nextHref = nextCursor
    ? `/console/members?${new URLSearchParams({
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.role ? { role: filters.role } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        cursor: nextCursor,
      })}`
    : null;

  return (
    <div className="space-y-4">
      <MemberFilters q={filters.q ?? ""} role={filters.role ?? ""} status={filters.status ?? ""} />
      {items.length === 0 ? (
        <p className="rounded-md border px-4 py-6 text-center text-muted-foreground">No members match.</p>
      ) : (
        <ul className="divide-y rounded-md border" aria-label="Members">
          {items.map((m) => (
            <li key={m.id}>
              <Link
                href={`/console/members/${m.id}`}
                prefetch={false}
                className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.displayName}</span>
                  <span className="block truncate text-sm text-muted-foreground">{m.email}</span>
                </span>
                <span className="hidden shrink-0 text-sm sm:block">{ROLE_LABELS[m.role]}</span>
                <span className="shrink-0">
                  <MemberStatusLabel status={m.status} />
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        {first(params.cursor) ? (
          <Link href="/console/members" prefetch={false} className="underline underline-offset-4">
            Back to the start
          </Link>
        ) : null}
        {nextHref ? (
          <Link href={nextHref} prefetch={false} className="font-medium underline underline-offset-4">
            Next page
          </Link>
        ) : null}
      </div>
    </div>
  );
}
