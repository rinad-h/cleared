import type { Metadata } from "next";
import { Gate } from "@/components/gate";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Rooms" };

export default function ConsoleRoomsPage() {
  return (
    <Gate area="staff">
      <Placeholder title="Rooms" phase={2} />
    </Gate>
  );
}
