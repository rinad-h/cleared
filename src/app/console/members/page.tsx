import type { Metadata } from "next";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Members" };

export default function ConsoleMembersPage() {
  return <Placeholder title="Members" phase={3} />;
}
