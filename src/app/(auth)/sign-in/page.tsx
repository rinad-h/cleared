import type { Metadata } from "next";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return <Placeholder title="Sign in" phase={1} />;
}
