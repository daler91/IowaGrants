import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import { cleanHtmlToText, extractDeadline } from "./utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawGrant {
  title: string;
  description: string;
  amount?: string;
  deadline?: string;
  eligibility?: string;
  applyUrl?: string;
  candidateUrls?: string[];
}

// ---------------------------------------------------------------------------
// Amount parsing
// ---------------------------------------------------------------------------

export function parseAmount(text: string): {
  amount?: string;
  amountMin?: number;
  amountMax?: number;
} {
  if (!text) return {};

  const cleaned = text.replaceAll(",", "");

  // Range: "$5,000 to $50,000" or "$5,000 - $50,000"
  const rangeMatch = /\$\s*([\d.]+)\s*(?:to|-|–|—)\s*\$\s*([\d.]+)/i.exec(cleaned);
  if (rangeMatch) {
    return {
      amount: text.trim(),
      amountMin: Number.parseFloat(rangeMatch[1]),
      amountMax: Number.parseFloat(rangeMatch[2]),
    };
  }

  // "Up to $X"
  const upToMatch = /up\s+to\s+\$\s*([\d.]+)/i.exec(cleaned);
  if (upToMatch) {
    return { amount: text.trim(), amountMax: Number.parseFloat(upToMatch[1]) };
  }

  // Single amount "$X"
  const singleMatch = /\$\s*([\d.]+)/.exec(cleaned);
  if (singleMatch) {
    const val = Number.parseFloat(singleMatch[1]);
    return { amount: text.trim(), amountMin: val, amountMax: val };
  }

  return { amount: text.trim() };
}

// ---------------------------------------------------------------------------
// Deadline parsing
// ---------------------------------------------------------------------------

export function parseDeadlineStr(str: string | undefined): Date | undefined {
  if (!str) return undefined;
  const cleaned = str.trim();
  if (/rolling|ongoing|year-round|open|varies|tbd|n\/a/i.test(cleaned)) return undefined;
  const d = new Date(cleaned);
  if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2024) return d;
  return undefined;
}

// ---------------------------------------------------------------------------
// Field extraction helpers
// ---------------------------------------------------------------------------

function extractLabeledField(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const pattern = new RegExp(String.raw`(?:^|\n)\s*${label}[.:\s]+([^\n]{3,150})`, "im");
    const match = pattern.exec(text);
    if (match?.[1]) {
      const value = match[1].trim();
      if (!/^(amount|deadline|eligibility|apply|award|who can)/i.test(value)) {
        return value;
      }
    }
  }
  return undefined;
}

// Negative-context words that indicate a dollar amount is NOT a grant award
const AMOUNT_NEGATIVE_CONTEXT = [
  "revenue",
  "income",
  "sales",
  "annual revenue",
  "gross revenue",
  "net income",
  "earn",
  "earning",
  "earnings",
  "must have",
  "require",
  "required",
  "minimum",
  "at least",
  "need",
  "maintain",
  "threshold",
  "no more than",
  "no less than",
  "invest",
  "investment",
  "raised",
  "valuation",
  "capitalization",
  "fee",
  "cost",
  "price",
  "pay",
  "charge",
  "salary",
  "wage",
  "tuition",
  "spend",
  "spending",
  "budget of",
];

// Positive-context words that indicate a dollar amount IS a grant award
const AMOUNT_POSITIVE_CONTEXT = [
  "award",
  "grant",
  "up to",
  "receive",
  "provides",
  "fund",
  "funding",
  "prize",
  "scholarship",
  "stipend",
  "offers",
];

export function extractAmountFromText(text: string): string | undefined {
  const amountPattern = /\$[\d,]+(?:\s*(?:to|-|–|—)\s*\$[\d,]+)?/g;
  const matches = Array.from(text.matchAll(amountPattern));
  if (matches.length === 0) return undefined;

  interface Candidate {
    match: string;
    index: number;
    hasPositiveContext: boolean;
  }

  const candidates: Candidate[] = [];

  for (const m of matches) {
    const idx = m.index ?? 0;
    const textBefore = text.slice(0, idx);
    const clauseStart = Math.max(
      textBefore.lastIndexOf("."),
      textBefore.lastIndexOf(";"),
      textBefore.lastIndexOf("\n"),
    );
    const precedingText = text.slice(Math.max(0, clauseStart), idx).toLowerCase();

    const hasNegative = AMOUNT_NEGATIVE_CONTEXT.some((word) => precedingText.includes(word));
    if (hasNegative) continue;

    const clauseEnd = text.indexOf(".", idx + m[0].length);
    const surroundingText = text
      .slice(Math.max(0, clauseStart), clauseEnd > 0 ? clauseEnd : idx + m[0].length + 60)
      .toLowerCase();
    const hasPositiveContext = AMOUNT_POSITIVE_CONTEXT.some((word) =>
      surroundingText.includes(word),
    );

    candidates.push({ match: m[0], index: idx, hasPositiveContext });
  }

  if (candidates.length === 0) return undefined;

  const preferred = candidates.find((c) => c.hasPositiveContext);
  return preferred ? preferred.match : candidates[0].match;
}

// ---------------------------------------------------------------------------
// Heading classification
// ---------------------------------------------------------------------------

const EDUCATIONAL_PATTERNS = [
  /\bvs\.?\s/,
  /\bversus\b/,
  /\bdiffer(?:s|ences?)?\b.*\bfrom\b/,
  /\bdifference(?:s)?\s+between\b/,
  /\bcompar(?:e[ds]?|ison)\b/,
];

const GENERIC_HEADINGS = [
  "table of contents",
  "bottom line",
  "frequently asked questions",
  "faq",
  "how to apply",
  "how to find",
  "what is",
  "what are",
  "tips for",
  "methodology",
  "about the author",
  "compare",
  "types of",
  "pros and cons",
  "how we chose",
  "our methodology",
  "related articles",
  "more from",
  "best small-business loans",
  "what are small-business grants",
  "how do small-business grants work",
  "where to find",
  "summary",
  "on this page",
  "key takeaways",
  "frequently asked",
  "final thoughts",
  "the bottom line",
  "next steps",
  "additional resources",
  "other resources",
  "how to write",
  "what you need",
  "before you apply",
  "wrapping up",
  "conclusion",
  "in summary",
  "share this",
  "about the",
  "you may also like",
  "related posts",
  "newsletter",
  "subscribe",
  "how grants differ",
  "how grants work",
  "how do grants work",
  "grants vs",
  "grant vs",
  "grants versus",
  "grant versus",
  "loans vs",
  "loan vs",
  "loans versus",
  "loan versus",
  "difference between",
  "differences between",
  "understanding grants",
  "understanding small business",
  "guide to",
  "a guide to",
  "your guide to",
  "complete guide",
  "what you need to know",
  "everything you need to know",
  "overview of",
  "an overview",
  "types of grants",
  "types of small business",
  "how to choose",
  "how to decide",
  "are grants taxable",
  "do you have to pay",
];

function isGenericHeading(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    lower.length < 4 ||
    GENERIC_HEADINGS.some((g) => lower.startsWith(g) || lower === g) ||
    EDUCATIONAL_PATTERNS.some((p) => p.test(lower))
  );
}

function cleanGrantTitle(title: string): string {
  return title.replace(/^\d+\.\s*/, "").trim();
}

// ---------------------------------------------------------------------------
// HTML parsing — extract grants from article pages
// ---------------------------------------------------------------------------

function findCandidateUrls(
  $: CheerioAPI,
  $section: cheerio.Cheerio<AnyNode>,
  siteDomain: string,
): string[] {
  const actionUrls: string[] = [];
  const otherUrls: string[] = [];

  $section.find("a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (!href.startsWith("http") || href.includes(siteDomain)) return;

    const linkText = $(a).text().toLowerCase();
    if (
      linkText.includes("apply") ||
      linkText.includes("learn more") ||
      linkText.includes("visit")
    ) {
      if (!actionUrls.includes(href)) actionUrls.push(href);
    } else {
      if (!otherUrls.includes(href)) otherUrls.push(href);
    }
  });

  return [...actionUrls, ...otherUrls];
}

function collectSectionElements(
  $: CheerioAPI,
  $heading: cheerio.Cheerio<AnyNode>,
  headingTag: string,
) {
  const sectionElements: AnyNode[] = [];
  let $el = $heading.next();
  let count = 0;

  while ($el.length && count < 20) {
    const tag = ($el.prop("tagName") || "").toLowerCase();
    if (tag === headingTag || (tag === "h2" && headingTag === "h3")) break;
    sectionElements.push($el[0]);
    $el = $el.next();
    count++;
  }
  return sectionElements;
}

function parseStructuredSections($: CheerioAPI, grants: RawGrant[], siteDomain: string): void {
  const headings = $("h2, h3").toArray();

  for (const heading of headings) {
    const $heading = $(heading);
    const title = cleanGrantTitle($heading.text().trim());

    if (isGenericHeading(title)) continue;
    if (title.length < 5 || title.length > 200) continue;

    const headingTag = ($heading.prop("tagName") || "H2").toLowerCase();
    const sectionElements = collectSectionElements($, $heading, headingTag);

    const $section = $(sectionElements);
    const sectionText = $section.text();

    if (!hasGrantFields(sectionText)) continue;

    const sectionHtml = sectionElements.map((el: AnyNode) => $.html(el)).join("");

    const deadlineLabel = extractLabeledField(sectionText, [
      "deadline",
      "due date",
      "close date",
      "application deadline",
      "closes",
    ]);
    const grant: RawGrant = {
      title,
      description: cleanHtmlToText(sectionHtml, 1500),
      amount: extractLabeledField(sectionText, [
        "amount",
        "award",
        "grant amount",
        "prize",
        "award amount",
      ]),
      deadline: deadlineLabel,
      eligibility: extractLabeledField(sectionText, [
        "eligibility",
        "who can apply",
        "eligible",
        "requirements",
        "qualifications",
      ]),
    };

    if (!grant.deadline) {
      const extracted = extractDeadline(sectionText);
      if (extracted) {
        grant.deadline = extracted.toISOString().split("T")[0];
      }
    }

    if (!grant.amount) {
      grant.amount = extractAmountFromText(sectionText);
    }

    const urls = findCandidateUrls($, $section, siteDomain);
    grant.applyUrl = urls[0];
    grant.candidateUrls = urls;

    grants.push(grant);
  }
}

function parseHeadingSections($: CheerioAPI, grants: RawGrant[], siteDomain: string): void {
  const headings = $("h2, h3").toArray();

  for (const heading of headings) {
    const $heading = $(heading);
    const title = cleanGrantTitle($heading.text().trim());

    if (isGenericHeading(title)) continue;
    if (title.length < 5 || title.length > 200) continue;

    let description = "";
    const candidateUrls: string[] = [];
    let $el = $heading.next();
    let collected = 0;

    while ($el.length && collected < 10) {
      const tag = ($el.prop("tagName") || "").toLowerCase();
      if (tag === "h2" || tag === "h3") break;

      description += $el.text().trim() + "\n";

      $el.find("a[href]").each((_, a) => {
        const href = $(a).attr("href") || "";
        if (
          href.startsWith("http") &&
          !href.includes(siteDomain) &&
          !candidateUrls.includes(href)
        ) {
          candidateUrls.push(href);
        }
      });

      $el = $el.next();
      collected++;
    }

    const lower = description.toLowerCase();
    const grantSignals = ["$", "grant", "award", "funding", "apply"];
    const positiveCount = grantSignals.filter((s) => lower.includes(s)).length;
    const isEducational = EDUCATIONAL_PATTERNS.some((p) => p.test(lower));
    const isGrant = positiveCount >= 2 && !isEducational;

    if (!isGrant) continue;

    let deadline = extractLabeledField(description, ["deadline", "due date"]);
    if (!deadline) {
      const extracted = extractDeadline(description);
      if (extracted) {
        deadline = extracted.toISOString().split("T")[0];
      }
    }

    grants.push({
      title,
      description: cleanHtmlToText(description, 1500),
      amount:
        extractLabeledField(description, ["amount", "award"]) || extractAmountFromText(description),
      deadline,
      eligibility: extractLabeledField(description, ["eligibility", "who can apply"]),
      applyUrl: candidateUrls[0],
      candidateUrls,
    });
  }
}

function hasGrantFields(text: string): boolean {
  const lower = text.toLowerCase();
  const fields = ["amount", "deadline", "eligibility", "apply", "award", "grant", "$"];
  let found = 0;
  for (const f of fields) {
    if (lower.includes(f)) found++;
  }

  if (EDUCATIONAL_PATTERNS.some((p) => p.test(lower))) {
    found -= 1;
  }

  return found >= 2;
}

/**
 * Parse grant listings from an article HTML page.
 * Uses two strategies: structured sections with labeled fields,
 * then heading-based sections as fallback.
 */
export function parseGrantsFromHtml(html: string, siteDomain: string): RawGrant[] {
  const $ = cheerio.load(html);
  const grants: RawGrant[] = [];

  // Remove noise elements
  $("nav, footer, header, aside, [role='navigation'], [role='banner']").remove();
  $("[class*='sidebar'], [class*='related'], [class*='footer'], [class*='nav']").remove();
  $("[class*='newsletter'], [class*='subscribe'], [class*='cookie']").remove();

  // Strategy 1: Structured sections with labeled fields
  parseStructuredSections($, grants, siteDomain);

  // Strategy 2: Heading-based sections (fallback)
  if (grants.length === 0) {
    parseHeadingSections($, grants, siteDomain);
  }

  return grants;
}
