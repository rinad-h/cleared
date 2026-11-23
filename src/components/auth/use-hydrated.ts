"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during server rendering and hydration, true after. Auth forms keep
 * their submit button disabled until then, so a tap before React has loaded
 * can't submit the form natively.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
