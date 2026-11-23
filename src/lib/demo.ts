/**
 * Demo data (Phase 7 P7-72): the seed names the makerspace "Demo …", and the
 * app shows a "Demo data" banner while the makerspace name starts with the
 * word "Demo" (case-sensitive, like the seed). A whole word, so a real space
 * called "Demolition Lab" never gets the banner.
 */
export function isDemoName(name: string | null | undefined): boolean {
  return typeof name === "string" && /^Demo\b/.test(name.trimStart());
}

export const DEMO_BANNER_TEXT = "Demo data. Not real makerspace records.";
