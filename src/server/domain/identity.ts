/**
 * Pure helpers for identity and access (Phase 1). No I/O.
 */

/** A 128-bit random token, base64url without padding (22 chars): join links, QR tokens, write tokens. */
export function newToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const DISPLAY_NAME_MAX = 80;

// C0/C1 control characters, plus the Unicode line/paragraph separators and
// bidirectional overrides/isolates that can make a name render as something else.
const CONTROL_RANGES: [number, number][] = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x2028, 0x2029],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];
const isControl = (codePoint: number) => CONTROL_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi);

/** True if `value` has characters a display name must not contain. */
export function hasControlChars(value: string): boolean {
  for (const ch of value) if (isControl(ch.codePointAt(0)!)) return true;
  return false;
}

/** Like `hasControlChars`, but allows newline, carriage return and tab (long free text: descriptions, notes). */
export function hasControlCharsInText(value: string): boolean {
  for (const ch of value) {
    if (ch === "\n" || ch === "\r" || ch === "\t") continue;
    if (isControl(ch.codePointAt(0)!)) return true;
  }
  return false;
}

function replaceControlChars(value: string, replacement: string): string {
  let out = "";
  for (const ch of value) out += isControl(ch.codePointAt(0)!) ? replacement : ch;
  return out;
}

/**
 * The display name stored on a membership, from the name entered at sign-up.
 * Sign-up already rejects bad names (src/lib/auth.ts); this is the backstop for
 * rows created some other way: control characters removed, whitespace collapsed,
 * cut to 80 characters, and the email's local part if nothing is left.
 */
export function toDisplayName(name: string, email: string): string {
  const cleaned = replaceControlChars(name, " ").replace(/\s+/g, " ").trim();
  const fallback = email.split("@")[0]?.trim() || "Member";
  return Array.from(cleaned || fallback).slice(0, DISPLAY_NAME_MAX).join("").trim() || "Member";
}

export const DEFAULT_NEXT = "/machines";

/**
 * Where to go after sign-in/sign-up. Only a same-site relative path is allowed
 * (starts with one `/`), so `?next=` can't send someone to another site.
 */
export function safeNext(value: string | null | undefined, fallback: string = DEFAULT_NEXT): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2000) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (hasControlChars(value) || value.includes("\\")) return fallback;
  try {
    const base = "http://cleared.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

/** The join link handed out by staff. Built from PUBLIC_BASE_URL only, never the request host. */
export function joinUrl(publicBaseUrl: string, token: string): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/join/${encodeURIComponent(token)}`;
}

export const DEFAULT_TIMEZONE = "America/Edmonton";

/** IANA time zones the runtime knows (plus "UTC", which some runtimes leave out of the list). */
export function supportedTimeZones(): string[] {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return zones.includes("UTC") ? zones : [...zones, "UTC"];
}

export function isSupportedTimeZone(value: string): boolean {
  return supportedTimeZones().includes(value);
}
