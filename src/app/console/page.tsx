import type { Metadata } from "next";
import { Gate } from "@/components/gate";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Staff console" };

export default function ConsoleHomePage() {
  return (
    <Gate area="staff">
      <Placeholder title="Staff console" phase={6} />
    </Gate>
  );
}
