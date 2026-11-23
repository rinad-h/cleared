import type { ReactNode } from "react";
import { LegalFooter } from "@/components/legal/legal-footer";

/** Single-column layout for sign-in, sign-up, join and setup screens, with the Help, Terms and Privacy links. */
export function CenteredLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4">
      <main id="main" className="flex flex-1 flex-col justify-center pt-10 pb-6">
        <p className="mb-6 text-lg font-semibold">Cleared</p>
        {children}
      </main>
      <LegalFooter className="border-t pb-4" />
    </div>
  );
}
