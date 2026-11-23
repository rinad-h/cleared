"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Award, CircleHelp, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/machines", label: "Machines", icon: Wrench },
  { href: "/me/certifications", label: "My certs", icon: Award },
  { href: "/help", label: "Help", icon: CircleHelp },
];

/**
 * Bottom tab bar of the member app. Links don't prefetch (each prefetch is a Worker request).
 * The current-tab highlight reads the URL, so it streams in inside <Suspense>
 * (required on dynamic routes such as /m/[token]).
 */
export function MemberTabBar() {
  return (
    <Suspense fallback={<TabBar pathname={null} />}>
      <TabBarWithPathname />
    </Suspense>
  );
}

function TabBarWithPathname() {
  return <TabBar pathname={usePathname()} />;
}

function TabBar({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-3">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
          return (
            <li key={href}>
              <Link
                href={href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
