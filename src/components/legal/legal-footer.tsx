import Link from "next/link";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/help", label: "Help" },
  { href: "/terms", label: "Terms of use" },
  { href: "/privacy", label: "Privacy notice" },
] as const;

/**
 * Footer with the Help, Terms and Privacy links (P7-13). Static: no data
 * reads, so it can sit in any layout. Links don't prefetch (each prefetch is
 * a Worker request).
 */
export function LegalFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("text-sm text-muted-foreground", className)}>
      <ul className="flex flex-wrap items-center gap-x-4">
        {LINKS.map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              prefetch={false}
              className="inline-flex min-h-11 items-center underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </footer>
  );
}
