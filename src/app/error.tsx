"use client";

import { useEffect, useRef, useState } from "react";
import { CenteredLayout } from "@/components/layouts/centered";
import { Button } from "@/components/ui/button";
import { DAILY_LIMIT_MESSAGE, isDailyLimitError } from "@/server/domain/errors";

/**
 * Error boundary with a retry button. When the cause is the free plan's daily
 * limit it says so instead of showing a generic error.
 *
 * Production builds hide server error messages from the client, so for server
 * errors (the ones with a `digest`) it asks /api/health once, which answers
 * 503 with `code: "DAILY_LIMIT"` while D1's daily quota is used up. Client-side
 * errors can't be a quota problem and cost no extra request.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const digest = error.digest;
  const knownDailyLimit = isDailyLimitError(error);
  const [probe, setProbe] = useState<{ digest: string; dailyLimit: boolean } | null>(null);
  const probed = useRef<string | null>(null);

  useEffect(() => {
    if (!digest || knownDailyLimit || probed.current === digest) return;
    probed.current = digest;
    let cancelled = false;
    fetch("/api/health", { cache: "no-store" })
      .then((res) => (res.status === 503 ? (res.json() as Promise<{ code?: string }>) : null))
      .then((body) => {
        if (!cancelled) setProbe({ digest, dailyLimit: body?.code === "DAILY_LIMIT" });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [digest, knownDailyLimit]);

  const dailyLimit = knownDailyLimit || (probe !== null && probe.digest === digest && probe.dailyLimit);

  return (
    <CenteredLayout>
      <div role="alert">
        {dailyLimit ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Cleared is resting until the daily reset</h1>
            <p className="mt-2 text-muted-foreground">{DAILY_LIMIT_MESSAGE}</p>
            <p className="mt-2 text-muted-foreground">Check machine labels and ask staff in the meantime.</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
            <p className="mt-2 text-muted-foreground">
              This page couldn&apos;t load. Try again; if it keeps happening, tell a staff member.
            </p>
          </>
        )}
        {digest ? <p className="mt-4 font-mono text-xs text-muted-foreground">Reference: {digest}</p> : null}
      </div>
      <Button className="mt-6 self-start" onClick={reset}>
        Try again
      </Button>
    </CenteredLayout>
  );
}
