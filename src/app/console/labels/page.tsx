import type { Metadata } from "next";
import { Gate } from "@/components/gate";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Labels" };

export default function ConsoleLabelsPage() {
  return (
    <Gate area="staff">
      <Placeholder title="Labels" phase={2} />
    </Gate>
  );
}
