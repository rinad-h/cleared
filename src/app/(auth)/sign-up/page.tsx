import type { Metadata } from "next";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return <Placeholder title="Create account" phase={1} />;
}
