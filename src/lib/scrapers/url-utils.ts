import axios from "axios";
import { isIP } from "node:net";
import { SCRAPER_USER_AGENT } from "./config";

// ── SSRF / URL-safety helpers ─────────────────────────────────────────

const BLOCKED_HOSTS = new Set([
  "169.254.169.254",      // AWS EC2 metadata
  "metadata.google.internal", // GCP metadata
  "100.100.100.200",      // Alibaba Cloud metadata
]);

/**
 * Returns true when `urlStr` is safe for server-side fetching.
 * Blocks private/link-local IPs, cloud metadata endpoints, and
 * non-HTTP(S) protocols to prevent SSRF.
 */
export function isSafeUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (BLOCKED_HOSTS.has(url.hostname)) return false;
    if (isIP(url.hostname)) {
      const parts = url.hostname.split(".");
      const first = Number.parseInt(parts[0]);
      // 10.x.x.x
      if (first === 10) return false;
      // 127.x.x.x
      if (first === 127) return false;
      // 172.16.0.0 – 172.31.255.255
      if (first === 172) {
        const second = Number.parseInt(parts[1]);
        if (second >= 16 && second <= 31) return false;
      }
      // 192.168.x.x
      if (url.hostname.startsWith("192.168.")) return false;
      // 169.254.x.x (link-local)
      if (url.hostname.startsWith("169.254.")) return false;
      // 0.0.0.0
      if (url.hostname === "0.0.0.0") return false;
    }
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
        "about", "contact", "home", "index", "main", "welcome",
        "business", "programs", "grants", "funding", "resources",
        "services", "help", "support", "faq", "blog", "news",
        "partners", "sponsors", "donate", "join", "membership",
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
