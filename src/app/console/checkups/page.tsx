import type { Metadata } from "next";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Checkups" };

export default function ConsoleCheckupsPage() {
  return <Placeholder title="Checkups" phase={6} />;
}
