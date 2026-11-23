import type { Metadata } from "next";
import { Gate } from "@/components/gate";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Machines" };

export default function ConsoleMachinesPage() {
  return (
    <Gate area="staff">
      <Placeholder title="Machines" phase={2} />
    </Gate>
  );
}
