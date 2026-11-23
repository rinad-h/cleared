import { ConsoleDrawer, ConsoleSidebar } from "@/components/layouts/console-nav";

/** Staff console: sidebar on desktop, drawer on phone. */
export default function ConsoleLayout({ children }: LayoutProps<"/console">) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden border-r bg-sidebar md:block">
        <p className="px-6 pt-5 text-base font-semibold">Cleared · Staff</p>
        <ConsoleSidebar />
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-2 md:hidden">
          <ConsoleDrawer />
          <span className="font-semibold">Cleared · Staff</span>
        </header>
        <main id="main" className="flex-1 px-4 py-6 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
