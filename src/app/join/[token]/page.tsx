import type { Metadata } from "next";
import { CenteredLayout } from "@/components/layouts/centered";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Join" };

export default function JoinPage() {
  return (
    <CenteredLayout>
      <Placeholder title="Join this makerspace" phase={1} />
    </CenteredLayout>
  );
}
