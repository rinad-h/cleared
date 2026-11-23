import { MemberShell } from "@/components/layouts/member-shell";

/** Public pages in the member app frame (Help). Static: no session reads here. */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <MemberShell>{children}</MemberShell>;
}
