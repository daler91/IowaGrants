import * as cheerio from "cheerio";

/**
 * Clean HTML content to plain text. Designed for sanitizing rich-text fields
 * from databases like Airtable that may contain iframes, tracking scripts,
 * navigation remnants, and other non-content HTML.
 */
export function cleanHtmlToText(html: string, maxLength = 2000): string {
  if (!html) return "";

  // If it doesn't look like HTML, just clean whitespace and return
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html.replaceAll(/\s+/g, " ").trim().slice(0, maxLength);
  }

  const $ = cheerio.load(html);

  // Remove non-content elements entirely
  $("script, style, iframe, noscript, nav, footer, header, svg").remove();

  // Convert block elements to newlines before stripping tags
  $("br").replaceWith("\n");
  $("p, div, li, h1, h2, h3, h4, h5, h6, tr, blockquote").each((_, el) => {
    $(el).prepend("\n");
    $(el).append("\n");
  });

  const text = $.text();

  return text
    .replaceAll("\r\n", "\n")
    .replaceAll(/[ \t]+/g, " ") // collapse horizontal whitespace
    .replaceAll("\n ", "\n") // trim leading spaces on lines
    .replaceAll(" \n", "\n") // trim trailing spaces on lines
    .replaceAll(/\n{3,}/g, "\n\n") // max 2 consecutive newlines
    .trim()
    .slice(0, maxLength);
}

// ── Deadline extraction ──────────────────────────────────────────────────

// Date formats used across deadline extraction
const DATE_FORMATS = [
  /([A-Z][a-z]{2,8}\.? \d{1,2},?\s*\d{4})/i, // January 15, 2025 / Mar. 15, 2025 / Jan 15 2025
  /(\d{1,2} [A-Z][a-z]{2,8},?\s*\d{4})/i, // 15 March, 2025 / 15 Jan 2025
  /(\d{1,2}\/\d{1,2}\/\d{2,4})/, // 01/15/2025
  /(\d{4}-\d{2}-\d{2})/, // 2025-01-15 (ISO)
  /([A-Z][a-z]{2,8}\.?\s+\d{4})/i, // March 2025 (month-only, interpreted as 1st)
];

function tryParseDate(text: string): Date | undefined {
  for (const fmt of DATE_FORMATS) {
    const match = fmt.exec(text);
    if (match?.[1]) {
      const parsed = new Date(match[1]);
      if (
        !Number.isNaN(parsed.getTime()) &&
        parsed.getFullYear() >= new Date().getFullYear() - 1 &&
        parsed.getFullYear() <= new Date().getFullYear() + 10
      ) {
        return parsed;
      }
    }
  }
  return undefined;
}

/**
 * Extract a deadline date from HTML content by searching for common patterns.
 */
export function extractDeadline(html: string): Date | undefined {
  const text = html.replaceAll(/<[^>]+>/g, " ").replaceAll(/\s+/g, " ");

  // Strategy 1: Find deadline label positions, then extract dates after them
  const labelPattern =
    /(?:deadline|due date|closes?|closing date|expiration|expires?|submit by|applications? due|apply by)[:\s]*/gi;

  let labelMatch;
  while ((labelMatch = labelPattern.exec(text)) !== null) {
    const after = text.slice(
      labelMatch.index + labelMatch[0].length,
      labelMatch.index + labelMatch[0].length + 80,
    );
    const date = tryParseDate(after);
    if (date) return date;
  }

  // Strategy 2: Flowing-text patterns — dates near deadline-related phrases
  const flowingPatterns = [
    /(?:applications?\s+(?:are\s+)?due|deadline\s+(?:is|to\s+apply))\s+(?:by\s+|on\s+|:?\s*)/gi,
    /(?:must\s+(?:be\s+)?(?:submitted?|received?)|submit\s+(?:your\s+)?applications?)\s+(?:by|before|no\s+later\s+than)\s+/gi,
    /(?:closes?|closing)\s+(?:on\s+|date\s+(?:is\s+)?)/gi,
    /(?:open|available|accepting\s+applications?)\s+(?:through|until|till)\s+/gi,
    /(?:apply|register)\s+(?:by|before)\s+/gi,
  ];

  for (const pattern of flowingPatterns) {
    let flowMatch;
    while ((flowMatch = pattern.exec(text)) !== null) {
      const after = text.slice(
        flowMatch.index + flowMatch[0].length,
        flowMatch.index + flowMatch[0].length + 80,
      );
      const date = tryParseDate(after);
      if (date) return date;
    }
  }

  return undefined;
}

/**
 * Find all date-shaped substrings in text and return the ones that parse to
 * a plausible future or recent date. Used by the deadline reconciliation
 * step to cheaply detect when a description contains a date that may
 * disagree with the stored `grant.deadline`.
 */
export function findAllDateCandidates(text: string): Date[] {
  const stripped = text.replaceAll(/<[^>]+>/g, " ").replaceAll(/\s+/g, " ");
  const found: Date[] = [];
  for (const fmt of DATE_FORMATS) {
    // clone flags to avoid shared lastIndex across calls
    const pattern = new RegExp(fmt.source, `${fmt.flags.includes("g") ? "" : "g"}${fmt.flags}`);
    let match;
    while ((match = pattern.exec(stripped)) !== null) {
      const parsed = new Date(match[1]);
      if (
        !Number.isNaN(parsed.getTime()) &&
        parsed.getFullYear() >= new Date().getFullYear() - 1 &&
        parsed.getFullYear() <= new Date().getFullYear() + 10
      ) {
        found.push(parsed);
      }
    }
  }
  return found;
}

/**
 * Validate a deadline date — returns undefined if the date is invalid or has
 * an unreasonable year (e.g. year 50315 from bad scraper data).
 */
export function validateDeadline(date: Date | undefined): Date | undefined {
  if (!date || Number.isNaN(date.getTime())) return undefined;
  const year = date.getFullYear();
  const currentYear = new Date().getFullYear();
  if (year < currentYear - 1 || year > currentYear + 10) return undefined;
  return date;
}

/**
 * Normalize a grant title for deduplication comparison.
 * Lowercases, strips punctuation/extra whitespace, removes common prefixes.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

/**
 * Parse grant dollar amounts from text, handling magnitude suffixes
 * like $12.68M, $50K, and ranges like "$5,000 to $50,000".
 * Returns null if no valid amount found or amount is suspiciously low (<$100).
 */
export function parseGrantAmount(text: string): { raw: string; min: number; max: number } | null {
  // Match dollar amounts with optional magnitude suffixes
  const amountPattern =
    /\$\s*([\d,]+(?:\.\d+)?)\s*([KkMmBb](?:illion|illion)?|[Kk]|[Mm]illion|[Bb]illion)?/g;

  const amounts: Array<{ value: number; raw: string }> = [];
  let match;

  while ((match = amountPattern.exec(text)) !== null) {
    const numStr = match[1].replaceAll(",", "");
    let value = Number.parseFloat(numStr);
    const suffix = match[2]?.toLowerCase();

    if (suffix) {
      if (suffix.startsWith("k")) value *= 1_000;
      else if (suffix.startsWith("m")) value *= 1_000_000;
      else if (suffix.startsWith("b")) value *= 1_000_000_000;
    }

    // Reject amounts below $100 (likely parsing errors like "$12.68" from "$12.68M" text)
    if (value < 100 && !suffix) continue;

    amounts.push({ value, raw: match[0].trim() });
  }

  if (amounts.length === 0) return null;

  // Check for range patterns in original text
  const rangePattern =
    /\$\s*[\d,]+(?:\.\d+)?\s*[KkMmBb]?\w*\s*(?:to|-|–|—)\s*\$\s*[\d,]+(?:\.\d+)?\s*[KkMmBb]?\w*/;
  const hasRange = rangePattern.test(text);

  if (hasRange && amounts.length >= 2) {
    const sorted = [...amounts].sort((a, b) => a.value - b.value);
    return {
      raw: `$${sorted[0].value.toLocaleString()} - $${sorted[sorted.length - 1].value.toLocaleString()}`,
      min: sorted[0].value,
      max: sorted[sorted.length - 1].value,
    };
  }

  // Single amount
  const best = amounts[0];
  return { raw: best.raw, min: best.value, max: best.value };
}
