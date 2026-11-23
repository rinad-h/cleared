"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Shows a toast once after a redirect (e.g. `?logged=available`), then drops
 * the query parameter so a reload doesn't show it again.
 */
export function FlashToast({ message, param }: { message: string | null; param: string }) {
  useEffect(() => {
    if (!message) return;
    toast.success(message, { id: `flash-${param}` }); // one toast even if the effect runs twice (dev Strict Mode)
    const url = new URL(window.location.href);
    url.searchParams.delete(param);
    window.history.replaceState(window.history.state, "", url);
  }, [message, param]);
  return null;
}
