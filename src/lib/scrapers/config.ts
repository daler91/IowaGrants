// ── Scraper configuration constants ──────────────────────────────────────
// Centralized timeouts, delays, and limits for all scrapers.

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
export const VALIDATION_BATCH_SIZE = 10;

/** Common User-Agent string for scraper requests */
export const SCRAPER_USER_AGENT =
  "IowaGrantScanner/1.0 (educational research project)";

/** Browser-like User-Agent for sites that block non-browser requests */
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
