import type { Metadata } from "next";
import { Gate } from "@/components/gate";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "My certifications" };

export default function MyCertificationsPage() {
  return (
    <Gate area="member">
      <Placeholder title="My certifications" phase={3} />
    </Gate>
  );
}
