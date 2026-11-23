import type { Metadata } from "next";
import { Gate } from "@/components/gate";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Faults" };

export default function ConsoleFaultsPage() {
  return (
    <Gate area="staff">
      <Placeholder title="Faults" phase={5} />
    </Gate>
  );
}
