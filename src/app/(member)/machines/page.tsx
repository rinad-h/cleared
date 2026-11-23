import type { Metadata } from "next";
import { Gate } from "@/components/gate";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Machines" };

export default function MachinesPage() {
  return (
    <Gate area="member">
      <Placeholder title="Machines" phase={4} />
    </Gate>
  );
}
