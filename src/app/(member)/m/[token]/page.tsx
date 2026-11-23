import type { Metadata } from "next";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Machine pass" };

/** The page a QR label opens. */
export default function MachinePassPage() {
  return <Placeholder title="Machine pass" phase={3} />;
}
