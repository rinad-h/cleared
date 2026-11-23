"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useHydrated } from "./use-hydrated";

/** Signs out, then goes to the sign-in page and drops the router cache of signed-in pages. */
export function SignOutButton({ variant = "outline" }: { variant?: "outline" | "ghost" | "default" }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      disabled={!hydrated || pending}
      onClick={async () => {
        setPending(true);
        try {
          await authClient.signOut();
        } finally {
          router.replace("/sign-in");
          router.refresh();
        }
      }}
    >
      <LogOut aria-hidden="true" />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
