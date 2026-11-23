import type { Metadata } from "next";
import { CenteredLayout } from "@/components/layouts/centered";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Setup" };

export default function SetupPage() {
  return (
    <CenteredLayout>
      <Placeholder title="Set up your makerspace" phase={1} />
    </CenteredLayout>
  );
}
