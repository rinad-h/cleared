import { FlaskConical } from "lucide-react";
import { getMe } from "@/data/me";
import { DEMO_BANNER_TEXT, isDemoName } from "@/lib/demo";

/** The "Demo data" strip (P7-72). Neutral colours: it's a notice, not a machine status. */
export function DemoNotice() {
  return (
    <p className="flex items-center justify-center gap-2 bg-primary px-4 py-1.5 text-center text-sm font-medium text-primary-foreground print:hidden">
      <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
      {DEMO_BANNER_TEXT}
    </p>
  );
}

/**
 * Shows <DemoNotice> while the makerspace name starts with "Demo". Reads the
 * makerspace through `getMe()`, which is cached per request and already called
 * by the header and the page's <Gate>, so it adds no D1 query. Reads the
 * session, so layouts render it inside <Suspense>.
 */
export async function DemoBanner() {
  const me = await getMe();
  return isDemoName(me.makerspace?.name) ? <DemoNotice /> : null;
}
