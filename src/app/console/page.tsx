import type { Metadata } from "next";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Staff console" };

export default function ConsoleHomePage() {
  return <Placeholder title="Staff console" phase={6} />;
}
