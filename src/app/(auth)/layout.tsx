import { CenteredLayout } from "@/components/layouts/centered";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <CenteredLayout>{children}</CenteredLayout>;
}
