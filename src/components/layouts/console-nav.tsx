"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  ClipboardCheck,
  DoorOpen,
  House,
  Menu,
  QrCode,
  Settings,
  Smartphone,
  TriangleAlert,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const ITEMS: { href: string; label: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { href: "/console", label: "Home", icon: House },
  { href: "/console/faults", label: "Faults", icon: TriangleAlert },
  { href: "/console/checkups", label: "Checkups", icon: ClipboardCheck },
  { href: "/console/machines", label: "Machines", icon: Wrench },
  { href: "/console/members", label: "Members", icon: Users },
  { href: "/console/rooms", label: "Rooms", icon: DoorOpen },
  { href: "/console/labels", label: "Labels", icon: QrCode },
  { href: "/console/certifications", label: "Certifications", icon: Award, adminOnly: true },
  { href: "/console/settings", label: "Settings", icon: Settings, adminOnly: true },
];

type NavProps = {
  /** Admin-only sections are listed for admins only (hiding is not security; services check). */
  isAdmin?: boolean;
  /** Open faults, shown next to "Faults" (as of the last full page load). */
  faultCount?: number | null;
  /** Overdue checkups, shown next to "Checkups" (as of the last full page load). */
  checkupCount?: number | null;
  onNavigate?: () => void;
};

/** The current-item highlight reads the URL, so it streams in inside <Suspense> (dynamic routes). */
function NavList(props: NavProps) {
  return (
    <Suspense fallback={<NavItems pathname={null} {...props} />}>
      <NavListWithPathname {...props} />
    </Suspense>
  );
}

function NavListWithPathname(props: NavProps) {
  return <NavItems pathname={usePathname()} {...props} />;
}

function NavItems({ pathname, isAdmin = false, faultCount, checkupCount, onNavigate }: NavProps & { pathname: string | null }) {
  return (
    <nav aria-label="Staff console" className="flex flex-col gap-1 p-3">
      <ul className="flex flex-col gap-1">
        {ITEMS.filter((item) => isAdmin || !item.adminOnly).map(({ href, label, icon: Icon }) => {
          const active =
            pathname !== null &&
            (href === "/console" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                {label}
                {href === "/console/faults" && faultCount ? (
                  <span className="ml-auto rounded-full bg-status-not-cleared px-2 text-xs text-status-not-cleared-foreground">
                    {faultCount}
                    <span className="sr-only"> open</span>
                  </span>
                ) : null}
                {href === "/console/checkups" && checkupCount ? (
                  <span className="ml-auto rounded-full bg-status-not-cleared px-2 text-xs text-status-not-cleared-foreground">
                    {checkupCount}
                    <span className="sr-only"> overdue</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        href="/machines"
        prefetch={false}
        onClick={onNavigate}
        className="mt-4 flex items-center gap-3 rounded-md border px-3 py-2 text-sm font-medium outline-none hover:bg-sidebar-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Smartphone aria-hidden="true" className="size-4" />
        Member app
      </Link>
    </nav>
  );
}

/** Sidebar navigation (desktop). */
type Counts = { isAdmin?: boolean; faultCount?: number | null; checkupCount?: number | null };

export function ConsoleSidebar(props: Counts) {
  return <NavList {...props} />;
}

/** Drawer navigation (phone). */
export function ConsoleDrawer(props: Counts) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 bg-sidebar p-0" aria-describedby={undefined}>
        <SheetTitle className="px-6 pt-5 text-base">Staff console</SheetTitle>
        <NavList {...props} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
