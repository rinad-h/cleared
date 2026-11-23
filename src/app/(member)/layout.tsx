import Link from "next/link";
import { MemberTabBar } from "@/components/layouts/member-tab-bar";

/** Member app: mobile-first, works at 320 px, bottom tab bar. */
export default function MemberLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center px-4">
          <Link href="/machines" prefetch={false} className="text-lg font-semibold">
            Cleared
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-24">
        {children}
      </main>
      <MemberTabBar />
    </div>
  );
}
