import { Suspense } from "react";
import { Toaster } from "sonner";
import { DemoBanner } from "@/components/layouts/demo-banner";
import { HeaderAccount } from "@/components/layouts/header-account";
import { MemberShell } from "@/components/layouts/member-shell";

/**
 * Member app (signed in). Each page renders `<Gate area="member">` itself,
 * since this layout doesn't re-render on client navigation.
 */
export default function MemberLayout({ children }: LayoutProps<"/">) {
  return (
    <MemberShell
      banner={
        <Suspense fallback={null}>
          <DemoBanner />
        </Suspense>
      }
      headerEnd={
        <Suspense fallback={null}>
          <HeaderAccount side="member" />
        </Suspense>
      }
    >
      {children}
      {/* Above the bottom tab bar on phones. */}
      <Toaster position="top-center" richColors={false} closeButton />
    </MemberShell>
  );
}
