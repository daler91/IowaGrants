import axios from "axios";
import { isIP } from "node:net";
import { SCRAPER_USER_AGENT } from "./config";

// ── SSRF / URL-safety helpers ─────────────────────────────────────────

const BLOCKED_HOSTS = new Set([
  "169.254.169.254", // AWS EC2 metadata
  "metadata.google.internal", // GCP metadata
  "100.100.100.200", // Alibaba Cloud metadata
]);

/**
 * Returns true when `urlStr` is safe for server-side fetching.
 * Blocks private/link-local IPs, cloud metadata endpoints, and
 * non-HTTP(S) protocols to prevent SSRF.
 */
function isPrivateIpV4(hostname: string): boolean {
  const parts = hostname.split(".");
  const first = Number.parseInt(parts[0]);
  if (first === 10 || first === 127) return true;
  if (first === 172) {
    const second = Number.parseInt(parts[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (hostname.startsWith("192.168.") || hostname.startsWith("169.254.")) return true;
  if (hostname === "0.0.0.0") return true;
  return false;
}

/**
 * Check if an IPv6 address (as returned by `new URL().hostname`) is private.
 * Node's URL parser strips brackets, so hostname will be e.g. "::1" not "[::1]".
 * IPv4-mapped IPv6 addresses are canonicalized by Node (e.g. ::ffff:127.0.0.1
 * becomes ::ffff:7f00:1), so we expand the check to cover those forms.
 */
function isPrivateIpV6(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  // Loopback
  if (lower === "::1") return true;
  // Link-local
  if (lower.startsWith("fe80:")) return true;
  // IPv4-mapped IPv6 — covers both ::ffff:127.0.0.1 and canonical ::ffff:7f00:1 forms
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice(7);
    // If the mapped portion contains dots, it's the dotted-decimal form
    if (mapped.includes(".")) return isPrivateIpV4(mapped);
    // Otherwise it's the canonical hex form — parse the two 16-bit groups
    // Format: ::ffff:XXYY:ZZWW where XX.YY.ZZ.WW is the IPv4 address
    const parts = mapped.split(":");
    if (parts.length === 2) {
      const high = Number.parseInt(parts[0], 16);
      const low = Number.parseInt(parts[1], 16);
      if (!Number.isNaN(high) && !Number.isNaN(low)) {
        const a = (high >> 8) & 0xff;
        const b = high & 0xff;
        const c = (low >> 8) & 0xff;
        const d = low & 0xff;
        return isPrivateIpV4(`${a}.${b}.${c}.${d}`);
      }
    }
  }
  return false;
}

export function isSafeUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (BLOCKED_HOSTS.has(url.hostname)) return false;
    // Strip brackets from IPv6 literals (Node's URL parser keeps them: "[::1]")
    const bare =
      url.hostname.startsWith("[") && url.hostname.endsWith("]")
        ? url.hostname.slice(1, -1)
        : url.hostname;
    const ipVersion = isIP(bare);
    if (ipVersion === 4 && isPrivateIpV4(bare)) return false;
    if (ipVersion === 6 && isPrivateIpV6(bare)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the URL string only if it uses http: or https: protocol.
 * Returns null for javascript:, data:, and other dangerous schemes.
 */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a URL is a generic landing page / homepage rather than a
 * specific grant page. Returns true if the URL looks like a homepage.
 */
export function isGenericHomepage(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, "");

    // Root path = homepage
    if (pathname === "" || pathname === "/") return true;

    const segments = pathname.split("/").filter(Boolean);

    // Single-segment generic paths
    if (segments.length === 1) {
      const generic = [
        "about",
        "contact",
        "home",
        "index",
        "main",
        "welcome",
        "business",
        "programs",
        "grants",
        "funding",
        "resources",
        "services",
        "help",
        "support",
        "faq",
        "blog",
        "news",
        "partners",
        "sponsors",
        "donate",
        "join",
        "membership",
      ];
      if (generic.includes(segments[0].toLowerCase())) return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Checks if a URL is reachable (not 404/5xx).
 * Uses HEAD with GET fallback, 5-second timeout.
 */
export async function checkUrlHealth(url: string): Promise<boolean> {
  try {
    const response = await axios.head(url, {
      timeout: 5000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        "User-Agent": SCRAPER_USER_AGENT,
      },
    });

    // HEAD succeeded — check status
    if (response.status >= 200 && response.status < 400) return true;

    // Some servers reject HEAD — try GET
    if (response.status === 405 || response.status === 403) {
      const getResponse = await axios.get(url, {
        timeout: 5000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          "User-Agent": SCRAPER_USER_AGENT,
          Range: "bytes=0-1024",
        },
      });
      return getResponse.status >= 200 && getResponse.status < 400;
    }

    return false;
  } catch {
    return false;
  }
}
