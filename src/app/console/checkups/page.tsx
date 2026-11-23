import type { Metadata } from "next";
import { Gate } from "@/components/gate";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Checkups" };

export default function ConsoleCheckupsPage() {
  return (
    <Gate area="staff">
      <Placeholder title="Checkups" phase={6} />
    </Gate>
  );
}
