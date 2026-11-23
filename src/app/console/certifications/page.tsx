import type { Metadata } from "next";
import { Gate } from "@/components/gate";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Certifications" };

export default function ConsoleCertificationsPage() {
  return (
    <Gate area="admin">
      <Placeholder title="Certifications" phase={2} />
    </Gate>
  );
}
