import type { Metadata } from "next";
import { Gate } from "@/components/gate";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Machine pass" };

/** The page a QR label opens. */
export default function MachinePassPage() {
  return (
    <Gate area="member">
      <Placeholder title="Machine pass" phase={3} />
    </Gate>
  );
}
