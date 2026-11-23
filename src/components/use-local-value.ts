"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A per-browser string remembered in localStorage (e.g. the board's filters).
 * The fallback on the server and before hydration; storage errors (private
 * mode) read as the fallback and aren't remembered.
 */
const EVENT = "cleared:local-value";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

export function useLocalValue(key: string, fallback: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );
  const set = useCallback(
    (next: string) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Not remembered.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
