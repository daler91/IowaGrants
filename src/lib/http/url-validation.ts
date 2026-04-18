import { isSafeUrl } from "@/lib/scrapers/url-utils";

const MAX_URL_LENGTH = 2048;

export type ValidatedUrl =
  | { ok: true; url: string }
  | { ok: false; reason: "empty" | "too_long" | "invalid_protocol" | "blocked_host" | "malformed" };

/**
 * Validates an external URL for storage or outbound requests.
 * Blocks javascript:/data:/file:, private IPs, and cloud metadata hosts.
 */
export function validateExternalUrl(raw: string): ValidatedUrl {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length > MAX_URL_LENGTH) return { ok: false, reason: "too_long" };

  let parsed: URL;
  try {
    // URL parsing is the validation mechanism here; downstream callers
    // never dereference a parsed URL, they only inspect protocol and
    // then pass the original string through isSafeUrl().
    parsed = new URL(trimmed); // NOSONAR: intentional URL parse for validation
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "invalid_protocol" };
  }

  if (!isSafeUrl(trimmed)) {
    return { ok: false, reason: "blocked_host" };
  }

  return { ok: true, url: trimmed };
}
