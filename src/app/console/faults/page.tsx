import type { Metadata } from "next";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Faults" };

export default function ConsoleFaultsPage() {
  return <Placeholder title="Faults" phase={5} />;
}
