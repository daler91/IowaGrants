import axios, { AxiosError } from "axios";
import * as cheerio from "cheerio";
import { BROWSER_HEADERS, SCRAPER_TIMEOUT_MS } from "./config";
import { isSafeUrl } from "./url-utils";
import { logWarn } from "@/lib/errors";

export type UrlHealth =
  | {
      alive: true;
      status: number;
      finalUrl: string;
      bodyText: string;
      bodyHtml: string;
    }
  | {
      alive: false;
      status: number | null;
      reason: "http_error" | "network_error" | "soft_404" | "non_html" | "blocked_unsafe_url";
      finalUrl?: string;
    };

const SOFT_404_PATTERNS = [
  "page not found",
  "couldn't find",
  "could not find",
  "no longer available",
  "page doesn't exist",
  "page does not exist",
  "sorry, we couldn't find",
  "404 error",
  "not found",
];

/**
 * Fetch a URL and classify whether it is a live, meaningful page.
 *
 * Returns rich content on success so callers can reuse the body (e.g. to
 * feed into the AI validator) without a second HTTP request.
 */
export async function checkUrlHealth(url: string): Promise<UrlHealth> {
  if (!isSafeUrl(url)) {
    logWarn("url-health", "Refused to fetch unsafe URL", { url, reason: "ssrf_blocked" });
    return { alive: false, status: null, reason: "blocked_unsafe_url" };
  }
  let response;
  try {
    response = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: SCRAPER_TIMEOUT_MS,
      maxRedirects: 5,
      // Accept any status so we can inspect 4xx/5xx ourselves instead of throwing.
      validateStatus: () => true,
    });
  } catch (error) {
    const axiosErr = error as AxiosError;
    return {
      alive: false,
      status: axiosErr.response?.status ?? null,
      reason: "network_error",
    };
  }

  const finalUrl = (response.request?.res?.responseUrl as string | undefined) ?? url;
  const status = response.status;

  if (status < 200 || status >= 300) {
    return { alive: false, status, reason: "http_error", finalUrl };
  }

  if (typeof response.data !== "string") {
    return { alive: false, status, reason: "non_html", finalUrl };
  }

  const html = response.data;
  const $ = cheerio.load(html);
  $("nav, footer, script, style, header, aside, noscript").remove();

  const bodyText = $("main, article, .content, .entry-content, body")
    .first()
    .text()
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 4000);

  // Soft-404 heuristic: short body combined with an explicit "not found"-style
  // marker anywhere in the first 2KB of the page.
  const lowerHead = bodyText.slice(0, 2000).toLowerCase();
  const hasSoft404Marker = SOFT_404_PATTERNS.some((p) => lowerHead.includes(p));
  if (hasSoft404Marker && bodyText.length < 3000) {
    return { alive: false, status, reason: "soft_404", finalUrl };
  }

  return {
    alive: true,
    status,
    finalUrl,
    bodyText,
    bodyHtml: html,
  };
}
