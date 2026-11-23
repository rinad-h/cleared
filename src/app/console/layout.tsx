import { Suspense } from "react";
import { Toaster } from "sonner";
import { HeaderAccount } from "@/components/layouts/header-account";
import { ConsoleDrawer, ConsoleSidebar } from "@/components/layouts/console-nav";
import { getOverdueCheckupCount } from "@/data/checkups";
import { getOpenFaultCount } from "@/data/faults";
import { getMe } from "@/data/me";

async function isAdmin(): Promise<boolean> {
  const me = await getMe();
  return me.membership?.status === "active" && me.membership.role === "admin";
}

async function navProps() {
  const [admin, faultCount, checkupCount] = await Promise.all([isAdmin(), getOpenFaultCount(), getOverdueCheckupCount()]);
  return { isAdmin: admin, faultCount, checkupCount };
}

async function SidebarForRole() {
  return <ConsoleSidebar {...await navProps()} />;
}

async function DrawerForRole() {
  return <ConsoleDrawer {...await navProps()} />;
}

/**
 * Staff console: sidebar on desktop, drawer on phone. Each page renders
 * `<Gate area="staff">` (or "admin") itself, since this layout doesn't
 * re-render on client navigation.
 */
export default function ConsoleLayout({ children }: LayoutProps<"/console">) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)] print:block">
      <aside className="hidden border-r bg-sidebar md:block print:hidden">
        <p className="px-6 pt-5 text-base font-semibold">Cleared · Staff</p>
        <Suspense fallback={<ConsoleSidebar />}>
          <SidebarForRole />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-2 md:px-6 print:hidden">
          <div className="md:hidden">
            <Suspense fallback={<ConsoleDrawer />}>
              <DrawerForRole />
            </Suspense>
          </div>
          <span className="font-semibold md:hidden">Cleared · Staff</span>
          <div className="ml-auto">
            <Suspense fallback={null}>
              <HeaderAccount side="console" />
            </Suspense>
          </div>
        </header>
        <main id="main" className="flex-1 px-4 py-6 md:px-8 print:p-0">
          {children}
        </main>
      </div>
      <Toaster position="top-center" richColors={false} closeButton />
    </div>
  );
}
