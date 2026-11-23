import type { Metadata } from "next";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "My certifications" };

export default function MyCertificationsPage() {
  return <Placeholder title="My certifications" phase={3} />;
}
