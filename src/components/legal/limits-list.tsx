import { LIMITS } from "@/lib/legal";

/** The PRD 5.4 limits as a list (Help and Terms share it). */
export function LimitsList() {
  return (
    <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
      {LIMITS.map((limit) => (
        <li key={limit}>{limit}</li>
      ))}
    </ul>
  );
}
