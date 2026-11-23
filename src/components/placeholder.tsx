import type { ReactNode } from "react";

/** Placeholder for screens built in a later phase. */
export function Placeholder({
  title,
  phase,
  children,
}: {
  title: string;
  phase: number;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      <p className="text-muted-foreground">This screen arrives in Phase {phase}.</p>
      {children}
    </section>
  );
}
