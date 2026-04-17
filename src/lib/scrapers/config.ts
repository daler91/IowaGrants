// ── Scraper configuration constants ──────────────────────────────────────
// Centralized timeouts, delays, and limits for all scrapers. Values can be
// overridden at boot via env vars without a code change.

function envInt(name: string, fallback: number, { min = 1, max = 10_000 } = {}): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/** Default HTTP request timeout for scraper fetches (ms) */
export const SCRAPER_TIMEOUT_MS = 20_000;

/** Timeout for PDF downloads (ms) — PDFs are larger, allow more time */
export const PDF_TIMEOUT_MS = 30_000;

/** Timeout for change-detection URL checks (ms) */
export const CHANGE_DETECTION_TIMEOUT_MS = 15_000;

/** Polite delay between sequential requests to the same host (ms) */
export const POLITE_DELAY_MS = 1_500;

/** Delay between AI validation API calls to avoid rate limits (ms) */
export const AI_CALL_DELAY_MS = 500;

/** Number of grants to validate per AI batch */
export const VALIDATION_BATCH_SIZE = envInt("AI_BATCH_SIZE", 10, { min: 1, max: 50 });

/** Number of grants to extract deadlines for per AI batch */
export const DEADLINE_AI_BATCH_SIZE = envInt("AI_BATCH_SIZE", 8, { min: 1, max: 50 });

/** Number of grants to generate descriptions for per AI batch */
export const DESCRIPTION_BATCH_SIZE = envInt("AI_BATCH_SIZE", 8, { min: 1, max: 50 });

/** Total search queries to run per scrape (anchor + rotating combined) */
export const QUERIES_PER_RUN = 16;

/** Max concurrent URL probes in change-detection */
export const CHANGE_DETECT_CONCURRENCY = envInt("CHANGE_DETECT_CONCURRENCY", 6, {
  min: 1,
  max: 32,
});

/** Max concurrent outbound HTTP fetches in scraper fan-out */
export const SCRAPER_CONCURRENCY = envInt("SCRAPER_CONCURRENCY", 8, { min: 1, max: 32 });

/** Common User-Agent string for scraper requests */
export const SCRAPER_USER_AGENT = "IowaGrantScanner/1.0 (educational research project)";

/** Browser-like User-Agent for sites that block non-browser requests */
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/** Reusable browser-like headers for scraper requests */
export const BROWSER_HEADERS = {
  "User-Agent": BROWSER_USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
} as const;
