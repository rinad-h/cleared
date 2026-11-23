"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Printer, TriangleAlert } from "lucide-react";
import { useHydrated } from "@/components/auth/use-hydrated";
import { Button } from "@/components/ui/button";
import { setLocalFlag } from "./use-local-flag";

const noSubscribe = () => () => {};

/**
 * Safety banners for anything printed (Phase 2 §6.2):
 * - not production → a red banner that also prints;
 * - this page's origin isn't PUBLIC_BASE_URL → a screen notice saying where labels point.
 */
export function PrintBanners({ environment, baseUrl, what }: { environment: string; baseUrl: string; what: string }) {
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => null);
  return (
    <>
      {environment !== "production" ? (
        <p
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-md border-2 border-red-700 bg-red-50 px-4 py-3 font-semibold text-red-800 [print-color-adjust:exact]"
        >
          <TriangleAlert aria-hidden="true" className="size-5 shrink-0" />
          NOT THE REAL APP: these {what} won&apos;t work ({environment} server).
        </p>
      ) : null}
      {origin !== null && origin !== baseUrl ? (
        <p className="mb-4 rounded-md border px-4 py-3 text-sm print:hidden">
          {what[0].toUpperCase() + what.slice(1)} point to <span className="font-mono break-all">{baseUrl}</span>, not
          this page&apos;s address.
        </p>
      ) : null}
    </>
  );
}

/** "Print" (remembers that labels were printed, for the setup checklist). */
export function PrintButton({ flag, children }: { flag?: string; children?: ReactNode }) {
  const hydrated = useHydrated();
  return (
    <Button
      type="button"
      disabled={!hydrated}
      onClick={() => {
        if (flag) setLocalFlag(flag);
        window.print();
      }}
    >
      <Printer aria-hidden="true" />
      {children ?? "Print"}
    </Button>
  );
}
