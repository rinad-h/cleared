"use client";

import { useSyncExternalStore } from "react";

/**
 * A per-browser yes/no remembered in localStorage (the setup checklist's
 * "Labels printed" and "Join link shared"). False on the server and before
 * hydration; storage errors (private mode) just read as false.
 */
const EVENT = "cleared:local-flag";

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function setLocalFlag(key: string) {
  try {
    window.localStorage.setItem(key, "1");
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Not remembered; the checklist simply stays unticked.
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

export function useLocalFlag(key: string): boolean {
  return useSyncExternalStore(subscribe, () => read(key), () => false);
}

export const FLAGS = {
  labelsPrinted: "cleared.setup.labelsPrinted",
  joinLinkShared: "cleared.setup.joinLinkShared",
} as const;
