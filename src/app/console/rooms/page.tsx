import type { Metadata } from "next";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Rooms" };

export default function ConsoleRoomsPage() {
  return <Placeholder title="Rooms" phase={2} />;
}
