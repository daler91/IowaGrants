import axios from "axios";
import * as cheerio from "cheerio";

/**
 * Extract a deadline date from HTML content by searching for common patterns.
 */
export function extractDeadline(html: string): Date | undefined {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // Patterns that precede a date
  const dateContextPatterns = [
    /(?:deadline|due date|closes?|closing date|expir(?:es?|ation)|submit by|applications? due|apply by)[:\s]*([A-Z][a-z]+ \d{1,2},?\s*\d{4})/i,
    /(?:deadline|due date|closes?|closing date|expir(?:es?|ation)|submit by|applications? due|apply by)[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /(?:deadline|due date|closes?|closing date|expir(?:es?|ation)|submit by|applications? due|apply by)[:\s]*(\d{4}-\d{2}-\d{2})/i,
  ];

  for (const pattern of dateContextPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const parsed = new Date(match[1]);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2024) {
        return parsed;
      }
    }
  }

  return undefined;
}

/**
 * Normalize a grant title for deduplication comparison.
 * Lowercases, strips punctuation/extra whitespace, removes common prefixes.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetch a page and extract text content + deadline.
 * Used by web scrapers to visit individual grant pages.
 */
export async function fetchPageDetails(
  url: string
): Promise<{ description: string; deadline?: Date } | null> {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "IowaGrantScanner/1.0 (educational research project)",
      },
      timeout: 10000,
      maxRedirects: 3,
    });

    const $ = cheerio.load(response.data);

    // Remove nav, footer, scripts
    $("nav, footer, script, style, header").remove();

    const bodyText = $("main, article, .content, .entry-content, body")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1000);

    const deadline = extractDeadline(response.data);

    return {
      description: bodyText || "",
      deadline,
    };
  } catch {
    return null;
  }
}
