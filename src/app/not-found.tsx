import Link from "next/link";
import { CenteredLayout } from "@/components/layouts/centered";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <CenteredLayout>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-muted-foreground">
        The link may be mistyped, or the page may have moved.
      </p>
      <Link href="/machines" prefetch={false} className={buttonVariants({ className: "mt-6 self-start" })}>
        Go to machines
      </Link>
    </CenteredLayout>
  );
}
