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

const ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/console", label: "Home", icon: House },
  { href: "/console/faults", label: "Faults", icon: TriangleAlert },
  { href: "/console/checkups", label: "Checkups", icon: ClipboardCheck },
  { href: "/console/machines", label: "Machines", icon: Wrench },
  { href: "/console/rooms", label: "Rooms", icon: DoorOpen },
  { href: "/console/members", label: "Members", icon: Users },
  { href: "/console/certifications", label: "Certifications", icon: Award },
  { href: "/console/labels", label: "Labels", icon: QrCode },
  { href: "/console/settings", label: "Settings", icon: Settings },
];

/** The current-item highlight reads the URL, so it streams in inside <Suspense> (dynamic routes). */
function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={<NavItems pathname={null} onNavigate={onNavigate} />}>
      <NavListWithPathname onNavigate={onNavigate} />
    </Suspense>
  );
}

function NavListWithPathname({ onNavigate }: { onNavigate?: () => void }) {
  return <NavItems pathname={usePathname()} onNavigate={onNavigate} />;
}

function NavItems({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return (
    <nav aria-label="Staff console" className="flex flex-col gap-1 p-3">
      <ul className="flex flex-col gap-1">
        {ITEMS.map(({ href, label, icon: Icon }) => {
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
export function ConsoleSidebar() {
  return <NavList />;
}

/** Drawer navigation (phone). */
export function ConsoleDrawer() {
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
        <NavList onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
