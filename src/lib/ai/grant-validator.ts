import Anthropic from "@anthropic-ai/sdk";
import type { GrantData } from "@/lib/types";

const anthropic = new Anthropic();

interface ValidationResult {
  index: number;
  is_real_grant: boolean;
  small_biz_eligible: boolean;
  content_type: "grant_application" | "awardee_announcement" | "news_article" | "info_page" | "expired_program" | "other";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
}

const VALIDATION_PROMPT = `You are evaluating scraped grant listings to determine if they are real, active grant programs for small businesses.

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
      content_type: "grant_application" as const,
      confidence: "MEDIUM" as const,
      reason: "Validation failed, assuming valid",
    }));
  }
}

/**
 * Validate scraped grants using AI to filter out non-real grants and
 * grants that aren't eligible for small businesses.
 *
 * ALL grants are validated — heuristic pre-filters in the orchestrator
 * reduce volume before grants reach this step.
 */
export async function validateGrants(grants: GrantData[]): Promise<GrantData[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("[grant-validator] ANTHROPIC_API_KEY not set — skipping validation");
    return grants;
  }

  if (grants.length === 0) {
    return grants;
  }

  console.log(
    `[grant-validator] Validating ${grants.length} grants with AI`
  );

  // Process in batches of 10
  const BATCH_SIZE = 10;
  const validated: GrantData[] = [];
  let filtered = 0;

  for (let i = 0; i < grants.length; i += BATCH_SIZE) {
    const batch = grants.slice(i, i + BATCH_SIZE).map((grant, idx) => ({
      grant,
      originalIndex: i + idx,
    }));
    const results = await validateBatch(batch);

    for (const result of results) {
      const entry = batch[result.index];
      if (!entry) continue;

      if (
        result.is_real_grant &&
        result.small_biz_eligible &&
        result.content_type === "grant_application" &&
        result.confidence !== "LOW"
      ) {
        validated.push(entry.grant);
      } else {
        filtered++;
        console.log(
          `[grant-validator] Filtered: "${entry.grant.title}" — ${result.reason} (type=${result.content_type}, real=${result.is_real_grant}, eligible=${result.small_biz_eligible}, confidence=${result.confidence})`
        );
      }
    }

    // Brief delay between API calls
    if (i + BATCH_SIZE < grants.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(
    `[grant-validator] Done. Kept ${validated.length}, filtered ${filtered}`
  );
  return validated;
}
