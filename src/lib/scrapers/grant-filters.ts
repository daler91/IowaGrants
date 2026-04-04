import { IOWA_LOCATIONS } from "@/lib/ai/categorizer";

// ── State restriction detection ──────────────────────────────────────────

const NON_IOWA_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Kansas", "Kentucky", "Louisiana", "Maine",
  "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
  "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah",
  "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
];

const NATIONWIDE_INDICATORS = [
  "nationwide", "all states", "50 states", "any state", "all us",
  "united states", "national", "across the country", "every state",
  "all 50", "open to all",
];

/**
 * Returns true if the text indicates a grant restricted to a specific non-Iowa state.
 * Returns false for nationwide grants or grants that don't restrict by state.
 */
export function isExcludedByStateRestriction(text: string): boolean {
  const lower = text.toLowerCase();

  if (NATIONWIDE_INDICATORS.some((ind) => lower.includes(ind))) {
    return false;
  }

  for (const state of NON_IOWA_STATES) {
    const s = state.toLowerCase();
    const restrictionPatterns = [
      `${s} only`,
      `${s} businesses only`,
      `${s} residents only`,
      `restricted to ${s}`,
      `available only in ${s}`,
      `must be located in ${s}`,
      `open to ${s} residents`,
      `eligible applicants must be in ${s}`,
      `available to ${s}`,
      `exclusively for ${s}`,
      `limited to ${s}`,
    ];

    if (restrictionPatterns.some((p) => lower.includes(p))) {
      return true;
    }
  }

  return false;
}

/**
 * Detect the geographic scope of a grant from its text content.
 * Returns location tags like ["Nationwide"], ["Iowa", "Des Moines"], etc.
 */
export function detectLocationScope(text: string): string[] {
  const lower = text.toLowerCase();

  const mentionsIowa = lower.includes("iowa");
  const isNationwide = NATIONWIDE_INDICATORS.some((ind) => lower.includes(ind));

  const iowaLocations = IOWA_LOCATIONS.filter((loc) => text.includes(loc));

  if (mentionsIowa && !isNationwide) {
    return iowaLocations.length > 0
      ? ["Iowa", ...iowaLocations]
      : ["Iowa"];
  }

  if (isNationwide) {
    const locs: string[] = ["Nationwide"];
    if (mentionsIowa) locs.push("Iowa");
    if (iowaLocations.length > 0) locs.push(...iowaLocations);
    return locs;
  }

  // No specific state mentioned — assume accessible nationwide
  return ["Nationwide"];
}

// ── Eligibility filters ──────────────────────────────────────────────────

/**
 * Returns true if the text indicates a grant is restricted to entity types
 * that are NOT small businesses (e.g., nonprofits only, government agencies only).
 */
export function isExcludedByEligibility(text: string): boolean {
  const lower = text.toLowerCase();

  const NON_SMALL_BIZ_PATTERNS = [
    "nonprofits only",
    "nonprofit organizations only",
    "non-profit organizations only",
    "501(c)(3) only",
    "501(c)(3) organizations only",
    "501c3 only",
    "tax-exempt organizations only",
    "tax-exempt only",
    "government agencies only",
    "state agencies only",
    "federal agencies only",
    "municipalities only",
    "municipal governments only",
    "tribal governments only",
    "tribal nations only",
    "universities only",
    "colleges only",
    "educational institutions only",
    "academic institutions only",
    "hospitals only",
    "health departments only",
    "public health agencies only",
    "must be a nonprofit",
    "must be a 501(c)",
    "must be a non-profit",
    "applicant must be a nonprofit",
    "applicants must be nonprofit",
    "limited to nonprofit",
    "limited to non-profit",
    "limited to government",
    "restricted to nonprofit",
    "restricted to non-profit",
    "restricted to government",
    "open to nonprofits only",
    "open to non-profits only",
    "available to nonprofits only",
    "eligible applicants include state",
    "eligible applicants include tribal",
    "only open to 501(c)",
    "only available to nonprofit",
    "not available to for-profit",
    "not eligible for for-profit",
    "for-profit businesses are not eligible",
    "for-profit organizations are not eligible",
    "ineligible.*for-profit",
  ];

  for (const pattern of NON_SMALL_BIZ_PATTERNS) {
    if (pattern.includes("*")) {
      const regex = new RegExp(pattern.replaceAll("*", ".*"), "i");
      if (regex.test(lower)) return true;
    } else if (lower.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Returns true if the text indicates a loan program or other non-grant
 * funding mechanism (e.g., revolving funds, low-interest loans).
 */
export function isNonGrantProgram(text: string): boolean {
  const lower = text.toLowerCase();

  const NON_GRANT_PATTERNS = [
    "loan program",
    "loan application",
    "loan repayment",
    "loan forgiveness program",
    "revolving fund",
    "revolving loan",
    "state revolving fund",
    "low-cost funds",
    "low-interest loan",
    "loan interest rate",
    "loan-based",
    "not a grant",
    "this is a loan",
    "repayable loan",
    "loan disbursement",
    "loan servicing",
  ];

  for (const pattern of NON_GRANT_PATTERNS) {
    if (lower.includes(pattern)) return true;
  }
  return false;
}

// ── Application content detection ────────────────────────────────────────

// Patterns that indicate an OPEN application opportunity
const APPLICATION_SIGNAL_PATTERNS = [
  /\bapply\s+(?:now|here|today|online|at)\b/i,
  /\bhow\s+to\s+apply\b/i,
  /\bsubmit\s+your\b/i,
  /\beligibility\s+requirements\b/i,
  /\beligible\s+applicants\b/i,
  /\bwho\s+can\s+apply\b/i,
  /\bapplication\s+deadline\b/i,
  /\bapply\s+by\b/i,
  /\bapplications?\s+due\b/i,
  /\bapplications?\s+(?:are\s+)?(?:now\s+)?(?:open|being\s+accepted|accepted)\b/i,
  /\brequest\s+for\s+(?:proposals|applications)\b/i,
  /\b(?:rfp|rfa|nofo)\b/i,
  /\bnotice\s+of\s+funding\b/i,
  /\bnext\s+cycle\s+opens?\b/i,
  /\bupcoming\s+(?:round|cycle|deadline)\b/i,
];

// Patterns that indicate awardee/recipient announcements (past awards)
const AWARDEE_PATTERNS = [
  /\breceives?\s+(?:\$[\d,]+\s+)?grants?\b/i,
  /\breceived\s+(?:\$[\d,]+\s+)?(?:in\s+)?(?:grant|funding)\b/i,
  /\bawarded\s+(?:\$[\d,]+\s+)?(?:in\s+)?grants?\b/i,
  /\bgrants?\s+awarded\s+to\b/i,
  /\bgrant\s+recipients?\b/i,
  /\bgrant\s+awardees?\b/i,
  /\bselected\s+to\s+receive\b/i,
  /\bchosen\s+to\s+receive\b/i,
  /\bannounces?\s+grant\s+(?:winners?|recipients?)\b/i,
  /\bgrants?\s+distributed\s+to\b/i,
  /\breceived\s+funding\s+from\b/i,
  /\bawarded\s+funding\b/i,
];

// Patterns that indicate press releases or news about past funding
const PRESS_RELEASE_PATTERNS = [
  /\bannounced\s+(?:today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bpress\s+release\b/i,
  /\bnews\s+release\b/i,
  /\bhas\s+funded\b/i,
  /\bwere\s+awarded\b/i,
  /\bdistributed\s+\$[\d,]+/i,
  /\bhas\s+awarded\b/i,
  /\bhas\s+distributed\b/i,
];

// URL path segments that suggest news/press content
const NEWS_URL_SEGMENTS = [
  "/press-release", "/press-releases", "/pressrelease",
  "/newsroom", "/news-room", "/media-center",
  "/news/", "/blog/",
];

// Patterns that indicate a closed or expired program
const CLOSED_PROGRAM_PATTERNS = [
  /\bapplications?\s+(?:are\s+)?closed\b/i,
  /\bno\s+longer\s+accepting\b/i,
  /\bprogram\s+has\s+ended\b/i,
  /\bfunding\s+(?:has\s+been\s+)?exhausted\b/i,
  /\ball\s+funds\s+have\s+been\b/i,
  /\bprogram\s+is\s+closed\b/i,
  /\bdeadline\s+has\s+passed\b/i,
  /\bapplications?\s+are\s+no\s+longer\b/i,
  /\bthis\s+grant\s+(?:program\s+)?is\s+no\s+longer\b/i,
];

/**
 * Returns true if the content looks grant-related but is NOT an open application.
 * Catches awardee announcements, press releases about past funding, and closed programs.
 */
export function isNonApplicationContent(
  title: string,
  description: string,
  url: string,
): { excluded: boolean; reason: string } {
  const text = `${title} ${description}`;

  const hasClosedLanguage = CLOSED_PROGRAM_PATTERNS.some((p) => p.test(text));
  if (hasClosedLanguage) {
    const hasApplicationSignal = APPLICATION_SIGNAL_PATTERNS.some((p) => p.test(text));
    if (!hasApplicationSignal) {
      return { excluded: true, reason: "Closed/expired program without open application signals" };
    }
  }

  const hasAwardeeLanguage = AWARDEE_PATTERNS.some((p) => p.test(text));
  if (hasAwardeeLanguage) {
    const hasApplicationSignal = APPLICATION_SIGNAL_PATTERNS.some((p) => p.test(text));
    if (!hasApplicationSignal) {
      return { excluded: true, reason: "Awardee/recipient announcement without application info" };
    }
  }

  const lowerUrl = url.toLowerCase();
  const isNewsUrl = NEWS_URL_SEGMENTS.some((seg) => lowerUrl.includes(seg));
  if (isNewsUrl) {
    const hasPressLanguage = PRESS_RELEASE_PATTERNS.some((p) => p.test(text));
    if (hasPressLanguage) {
      const hasApplicationSignal = APPLICATION_SIGNAL_PATTERNS.some((p) => p.test(text));
      if (!hasApplicationSignal) {
        return { excluded: true, reason: "Press release/news article about past funding" };
      }
    }
  }

  return { excluded: false, reason: "" };
}
