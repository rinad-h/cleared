import { Suspense } from "react";
import { HeaderAccount } from "@/components/layouts/header-account";
import { MemberShell } from "@/components/layouts/member-shell";

/**
 * Member app (signed in). Each page renders `<Gate area="member">` itself,
 * since this layout doesn't re-render on client navigation.
 */
export default function MemberLayout({ children }: LayoutProps<"/">) {
  return (
    <MemberShell
      headerEnd={
        <Suspense fallback={null}>
          <HeaderAccount side="member" />
        </Suspense>
      }
    >
      {children}
    </MemberShell>
  );
}
