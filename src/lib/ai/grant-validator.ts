import type { GrantData } from "@/lib/types";
import { env } from "@/lib/env";
import { VALIDATION_BATCH_SIZE, AI_CALL_DELAY_MS } from "@/lib/scrapers/config";
import { log, logError, logWarn } from "@/lib/errors";
import { ValidationResultArraySchema, type ValidationResult } from "./schemas";
import { getAnthropic } from "./client";
import type { IntegrationBudget } from "./budget";
import { computeBackoffDelay, sleep } from "./backoff";

const VALIDATION_PROMPT = `You are evaluating scraped grant listings to determine if they are real, active grant programs for small businesses.

IMPORTANT: If a "Live page excerpt" is provided for a grant, weight it HEAVILY over the Description — the excerpt is what the source URL actually serves right now, while the Description may be a cached/stale summary. If the live excerpt shows a 404 / "page not found" / generic homepage / marketing landing page / no grant-specific content, classify as "expired_program" or "other" and set is_real_grant=false, even if the Description sounds legitimate.

For each grant below, determine:
1. content_type: Classify the content as one of:
   - "grant_application": An actual grant program with an open or upcoming application process
   - "awardee_announcement": A news story or press release about grants that were ALREADY awarded to specific recipients
   - "news_article": A general news article, blog post, guide, listicle, or advertisement about grants
   - "info_page": A general info/resource page, landing page, homepage, or category page with no specific grant
   - "expired_program": A grant program that is closed, expired, or no longer accepting applications
   - "other": Anything else that is not a grant application (commercial service, mortgage product, competition without direct funding, etc.)

2. is_real_grant: Is this an actual grant program with an open or upcoming application? Answer true ONLY for content_type "grant_application". Answer false for ALL other content types, including:
   - Articles, blog posts, guides, advertisements, listicles, or news stories
   - Press releases or news announcements about grants that were already awarded
   - Awardee/recipient announcements (e.g., "30 farmers received funding from the Choose Iowa program") — these describe past awards, not open applications
   - General info/resource pages with no specific grant or funding opportunity
   - Landing pages, homepages, or category pages
   - Title/mortgage insurance products or commercial services
   - Pages with 404 errors, broken content, or no meaningful information
   - Competitions, incubators, or accelerators that don't directly award grant funds
   - Closed or expired grant programs with no upcoming cycle

   KEY DISTINCTION: A page about a grant program is only valid if it describes how to APPLY for funding. Pages that report on who RECEIVED funding (awardee lists, press releases about grant distribution, news about recipients) are NOT valid — they describe completed awards, not open opportunities.

3. small_biz_eligible: Can small for-profit businesses apply? Answer false if it's exclusively for nonprofits, government agencies, universities, hospitals, K-12 schools, tribal governments, or other non-business entities.

4. confidence: How confident are you? HIGH = clearly real grant or clearly not. MEDIUM = likely but some ambiguity. LOW = very uncertain.

5. reason: Brief (1 sentence) explanation of your decision.

Return a JSON array of objects with: {index, content_type, is_real_grant, small_biz_eligible, confidence, reason}
Return ONLY valid JSON, no markdown code fences.`;

function buildGrantSnippet(grant: GrantData, index: number): string {
  const parts = [
    `[${index}] Title: ${grant.title}`,
    `Source: ${grant.sourceName}`,
    `URL: ${grant.sourceUrl}`,
  ];
  if (grant.description) {
    parts.push(`Description: ${grant.description.slice(0, 500)}`);
  }
  if (grant.eligibility) {
    parts.push(`Eligibility: ${grant.eligibility.slice(0, 200)}`);
  }
  if (grant.amount) {
    parts.push(`Amount: ${grant.amount}`);
  }
  const liveBodyText =
    grant.rawData && typeof grant.rawData === "object" ? grant.rawData.liveBodyText : undefined;
  if (typeof liveBodyText === "string" && liveBodyText.length > 0) {
    parts.push(`Live page excerpt: ${liveBodyText.slice(0, 1500)}`);
  }
  return parts.join("\n");
}

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

async function validateBatch(
  grants: Array<{ grant: GrantData; originalIndex: number }>,
  budget?: IntegrationBudget,
): Promise<ValidationResult[] | null> {
  const snippets = grants.map(({ grant }, i) => buildGrantSnippet(grant, i));

  const message = `${VALIDATION_PROMPT}\n\n---\n\n${snippets.join("\n\n---\n\n")}`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      let response;
      try {
        response = await getAnthropic().messages.create(
          {
            model: "claude-haiku-4-5-20251001",
            max_tokens: 2000,
            messages: [{ role: "user", content: message }],
          },
          { signal: controller.signal },
        );
      } finally {
        clearTimeout(timeout);
      }

      budget?.recordTokens(response.usage);
      const text = response.content[0].type === "text" ? response.content[0].text : "";

      // Strip markdown fences if present
      const cleaned = text
        .replace(/^```(?:json)?\s*/m, "")
        .replace(/\s*```\s*$/m, "")
        .trim();

      const raw = JSON.parse(cleaned);
      const results = ValidationResultArraySchema.parse(raw);
      return results;
    } catch (error) {
      logError(
        "grant-validator",
        `Batch validation attempt ${attempt + 1}/${MAX_RETRIES} failed`,
        error,
      );

      if (attempt < MAX_RETRIES - 1) {
        await sleep(computeBackoffDelay(error, attempt, INITIAL_RETRY_DELAY_MS));
      }
    }
  }

  // Fail closed: return null to signal the batch should be rejected
  logError("grant-validator", "All attempts failed — rejecting batch (fail-closed)", undefined, {
    attempts: MAX_RETRIES,
    batchSize: grants.length,
  });
  return null;
}

/**
 * Validate scraped grants using AI to filter out non-real grants and
 * grants that aren't eligible for small businesses.
 *
 * ALL grants are validated — heuristic pre-filters in the orchestrator
 * reduce volume before grants reach this step.
 */
const KNOWN_NON_GRANT_TYPES = new Set([
  "awardee_announcement",
  "news_article",
  "info_page",
  "expired_program",
  "other",
]);

function isValidGrant(result: ValidationResult): boolean {
  return (
    result.is_real_grant &&
    result.small_biz_eligible &&
    !KNOWN_NON_GRANT_TYPES.has(result.content_type) &&
    result.confidence !== "LOW"
  );
}

function processBatchResults(
  batch: Array<{ grant: GrantData; originalIndex: number }>,
  results: ValidationResult[],
  validated: GrantData[],
): number {
  let filtered = 0;
  for (const result of results) {
    const entry = batch[result.index];
    if (!entry) continue;

    if (isValidGrant(result)) {
      validated.push(entry.grant);
    } else {
      filtered++;
      log("grant-validator", `Filtered: "${entry.grant.title}"`, {
        reason: result.reason,
        contentType: result.content_type,
        isRealGrant: result.is_real_grant,
        eligible: result.small_biz_eligible,
        confidence: result.confidence,
      });
    }
  }
  return filtered;
}

export async function validateGrants(
  grants: GrantData[],
  opts: { budget?: IntegrationBudget } = {},
): Promise<GrantData[]> {
  if (!env.ANTHROPIC_API_KEY) {
    log("grant-validator", "ANTHROPIC_API_KEY not set — skipping validation");
    return grants;
  }

  if (grants.length === 0) return grants;

  log("grant-validator", `Validating ${grants.length} grants with AI`);

  const BATCH_SIZE = VALIDATION_BATCH_SIZE;
  const validated: GrantData[] = [];
  let filtered = 0;

  for (let i = 0; i < grants.length; i += BATCH_SIZE) {
    if (opts.budget && !opts.budget.canCallAI()) {
      log("grant-validator", "Budget exhausted — skipping remaining batches", {
        processed: i,
        total: grants.length,
      });
      break;
    }

    const batch = grants.slice(i, i + BATCH_SIZE).map((grant, idx) => ({
      grant,
      originalIndex: i + idx,
    }));
    opts.budget?.recordAICall();
    const results = await validateBatch(batch, opts.budget);

    if (results === null) {
      filtered += batch.length;
      logWarn("grant-validator", "Dropped batch due to validation failure", {
        batchSize: batch.length,
      });
      continue;
    }

    filtered += processBatchResults(batch, results, validated);

    if (i + BATCH_SIZE < grants.length) {
      await new Promise((r) => setTimeout(r, AI_CALL_DELAY_MS));
    }
  }

  log("grant-validator", "Validation complete", { kept: validated.length, filtered });
  return validated;
}
