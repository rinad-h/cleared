"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEBOUNCE_MS = 300;

type Filters = { q: string; role: string; status: string };

/**
 * Search box (debounced) and role/status filters. They update the URL and the
 * server renders the list. The fields are uncontrolled, and without JavaScript
 * the form is a plain GET form, so nothing typed before hydration is lost: on
 * mount, values that differ from the URL are applied.
 */
export function MemberFilters({ q, role, status }: Filters) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applied = useRef<Filters>({ q, role, status });

  function read(): Filters {
    const data = new FormData(form.current ?? undefined);
    return {
      q: String(data.get("q") ?? "").trim(),
      role: String(data.get("role") ?? ""),
      status: String(data.get("status") ?? ""),
    };
  }

  function apply() {
    if (timer.current) clearTimeout(timer.current);
    const next = read();
    const prev = applied.current;
    if (next.q === prev.q && next.role === prev.role && next.status === prev.status) return;
    applied.current = next;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value !== "") params.set(key, value);
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  // Apply anything typed or chosen before React loaded.
  useEffect(() => {
    apply();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  return (
    <form
      ref={form}
      role="search"
      aria-busy={pending}
      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="member-search">Search</Label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
          <Input
            id="member-search"
            type="search"
            name="q"
            defaultValue={q}
            maxLength={80}
            placeholder="Name or email"
            className="pl-9"
            onChange={() => {
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(apply, DEBOUNCE_MS);
            }}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="member-role">Role</Label>
        <NativeSelect id="member-role" name="role" defaultValue={role} onChange={apply}>
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="staff">Staff</option>
          <option value="member">Member</option>
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="member-status">Status</Label>
        <NativeSelect id="member-status" name="status" defaultValue={status} onChange={apply}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </NativeSelect>
      </div>
    </form>
  );
}
