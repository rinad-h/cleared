import type { ReactNode } from "react";

/** Single-column layout for sign-in, sign-up, join and setup screens. */
export function CenteredLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <p className="mb-6 text-lg font-semibold">Cleared</p>
      {children}
    </main>
  );
}
