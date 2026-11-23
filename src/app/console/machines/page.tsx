import type { Metadata } from "next";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Machines" };

export default function ConsoleMachinesPage() {
  return <Placeholder title="Machines" phase={2} />;
}
