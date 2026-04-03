import Anthropic from "@anthropic-ai/sdk";
import type { GrantData } from "@/lib/types";

const anthropic = new Anthropic();

// Sources that are already verified and don't need AI validation
const HIGH_TRUST_SOURCES = new Set([
  "sam.gov",
  "simpler-grants",
  "grants-gov-api",
  "usda-rd",
  "ieda",
  "opportunity-iowa",
  "iowa-grants-gov",
  "airtable-grants",
  // Foundation grants are curated by us
  "amber-grant",
  "hello-alice",
  "fedex-grant",
  "nase",
  "nav-grant",
  "cartier-women",
  "ifundwomen",
  "visa-initiative",
  "walmart-spark",
  "eileen-fisher",
  "streetshares",
  "nbmbaa-pitch",
  // Iowa local scrapers are validated by AI since they can produce non-grant content
]);

interface ValidationResult {
  index: number;
  is_real_grant: boolean;
  small_biz_eligible: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
}

const VALIDATION_PROMPT = `You are evaluating scraped grant listings to determine if they are real, active grant programs for small businesses.

For each grant below, determine:
1. is_real_grant: Is this an actual grant program that awards money? Answer false if it's:
   - An article, blog post, guide, advertisement, listicle, or news story
   - A general info/resource page with no specific grant or funding opportunity
   - A landing page, homepage, or category page
   - A title/mortgage insurance product or commercial service
   - A page with 404 errors, broken content, or no meaningful information
   - A competition, incubator, or accelerator that doesn't directly award grant funds
2. small_biz_eligible: Can small for-profit businesses apply? Answer false if it's exclusively for nonprofits, government agencies, universities, hospitals, K-12 schools, tribal governments, or other non-business entities.
3. confidence: How confident are you? HIGH = clearly real grant or clearly not. MEDIUM = likely but some ambiguity. LOW = very uncertain.
4. reason: Brief (1 sentence) explanation of your decision.

Return a JSON array of objects with: {index, is_real_grant, small_biz_eligible, confidence, reason}
Return ONLY valid JSON, no markdown code fences.`;

function buildGrantSnippet(grant: GrantData, index: number): string {
  const parts = [
    `[${index}] Title: ${grant.title}`,
    `Source: ${grant.sourceName}`,
    `URL: ${grant.sourceUrl}`,
  ];
  if (grant.description) {
    parts.push(`Description: ${grant.description.slice(0, 300)}`);
  }
  if (grant.eligibility) {
    parts.push(`Eligibility: ${grant.eligibility.slice(0, 200)}`);
  }
  if (grant.amount) {
    parts.push(`Amount: ${grant.amount}`);
  }
  return parts.join("\n");
}

async function validateBatch(
  grants: Array<{ grant: GrantData; originalIndex: number }>
): Promise<ValidationResult[]> {
  const snippets = grants.map(({ grant }, i) =>
    buildGrantSnippet(grant, i)
  );

  const message = `${VALIDATION_PROMPT}\n\n---\n\n${snippets.join("\n\n---\n\n")}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{ role: "user", content: message }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Strip markdown fences if present
    const cleaned = text
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/\s*```\s*$/m, "")
      .trim();

    const results: ValidationResult[] = JSON.parse(cleaned);
    return results;
  } catch (error) {
    console.error(
      "[grant-validator] Batch validation failed:",
      error instanceof Error ? error.message : error
    );
    // On failure, assume all grants are valid (fail-open)
    return grants.map((_, i) => ({
      index: i,
      is_real_grant: true,
      small_biz_eligible: true,
      confidence: "MEDIUM" as const,
      reason: "Validation failed, assuming valid",
    }));
  }
}

/**
 * Validate scraped grants using AI to filter out non-real grants and
 * grants that aren't eligible for small businesses.
 *
 * Only validates grants from low-trust sources (web search, articles).
 * High-trust sources (federal APIs, curated lists) are passed through.
 */
export async function validateGrants(grants: GrantData[]): Promise<GrantData[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("[grant-validator] ANTHROPIC_API_KEY not set — skipping validation");
    return grants;
  }

  const trusted: GrantData[] = [];
  const toValidate: Array<{ grant: GrantData; originalIndex: number }> = [];

  for (let i = 0; i < grants.length; i++) {
    if (HIGH_TRUST_SOURCES.has(grants[i].sourceName)) {
      trusted.push(grants[i]);
    } else {
      toValidate.push({ grant: grants[i], originalIndex: i });
    }
  }

  if (toValidate.length === 0) {
    console.log("[grant-validator] All grants from high-trust sources, skipping validation");
    return grants;
  }

  console.log(
    `[grant-validator] Validating ${toValidate.length} grants from low-trust sources (${trusted.length} trusted, skipped)`
  );

  // Process in batches of 10
  const BATCH_SIZE = 10;
  const validated: GrantData[] = [...trusted];
  let filtered = 0;

  for (let i = 0; i < toValidate.length; i += BATCH_SIZE) {
    const batch = toValidate.slice(i, i + BATCH_SIZE);
    const results = await validateBatch(batch);

    for (const result of results) {
      const entry = batch[result.index];
      if (!entry) continue;

      if (
        result.is_real_grant &&
        result.small_biz_eligible &&
        result.confidence !== "LOW"
      ) {
        validated.push(entry.grant);
      } else {
        filtered++;
        console.log(
          `[grant-validator] Filtered: "${entry.grant.title}" — ${result.reason} (real=${result.is_real_grant}, eligible=${result.small_biz_eligible}, confidence=${result.confidence})`
        );
      }
    }

    // Brief delay between API calls
    if (i + BATCH_SIZE < toValidate.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(
    `[grant-validator] Done. Kept ${validated.length}, filtered ${filtered}`
  );
  return validated;
}
