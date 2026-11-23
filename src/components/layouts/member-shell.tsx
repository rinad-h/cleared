import type { ReactNode } from "react";
import Link from "next/link";
import { MemberTabBar } from "@/components/layouts/member-tab-bar";

/** Member app frame: mobile-first (works at 320 px), header and bottom tab bar. */
export function MemberShell({ children, headerEnd }: { children: ReactNode; headerEnd?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-2 px-4">
          <Link href="/machines" prefetch={false} className="text-lg font-semibold">
            Cleared
          </Link>
          {headerEnd}
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-24">
        {children}
      </main>
      <MemberTabBar />
    </div>
  );
}
