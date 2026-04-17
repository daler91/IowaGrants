import type { GrantData } from "@/lib/types";
import { env } from "@/lib/env";
import { DESCRIPTION_BATCH_SIZE, AI_CALL_DELAY_MS } from "@/lib/scrapers/config";
import { log, logError, logWarn } from "@/lib/errors";
import { DescriptionResultArraySchema } from "./schemas";
import { getAnthropic } from "./client";
import type { IntegrationBudget } from "./budget";
import { computeBackoffDelay, sleep } from "./backoff";

const DESCRIPTION_PROMPT = `You are writing clear, helpful descriptions for grant programs aimed at Iowa small business owners.

For each grant below, write a description that:
1. Opens with what the grant funds (1 sentence)
2. States who is eligible and any key requirements (1-2 sentences)
3. Mentions the funding amount if known (1 sentence, omit if not provided)
4. Notes the application deadline if known (1 sentence, omit if not provided)
5. Ends with the administering agency or source

Guidelines:
- Write in plain, professional English at a 10th-grade reading level
- Keep each description to 2-5 sentences (60-150 words)
- Do NOT invent information — only use what is provided
- Do NOT include URLs or links
- If the existing description is already clear and complete, you may return it largely unchanged
- Use active voice and address the reader as potential applicants where natural

Return a JSON array of objects with: {index, description}
Return ONLY valid JSON, no markdown code fences.`;

function buildGrantSnippet(grant: GrantData, index: number): string {
  const parts = [`[${index}] Title: ${grant.title}`, `Source: ${grant.sourceName}`];
  if (grant.description) {
    parts.push(`Current description: ${grant.description.slice(0, 800)}`);
  }
  if (grant.eligibility) {
    parts.push(`Eligibility: ${grant.eligibility.slice(0, 400)}`);
  }
  if (grant.amount) {
    parts.push(`Amount: ${grant.amount}`);
  }
  if (grant.deadline) {
    parts.push(`Deadline: ${grant.deadline.toISOString().split("T")[0]}`);
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

async function generateBatchDescriptions(
  grants: GrantData[],
): Promise<Array<{ index: number; description: string }> | null> {
  const snippets = grants.map((grant, i) => buildGrantSnippet(grant, i));
  const message = `${DESCRIPTION_PROMPT}\n\n---\n\n${snippets.join("\n\n---\n\n")}`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await getAnthropic().messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages: [{ role: "user", content: message }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";

      // Strip markdown fences if present
      const cleaned = text
        .replace(/^```(?:json)?\s*/m, "")
        .replace(/\s*```\s*$/m, "")
        .trim();

      const raw = JSON.parse(cleaned);
      const results = DescriptionResultArraySchema.parse(raw);
      return results;
    } catch (error) {
      logError(
        "description-generator",
        `Batch description attempt ${attempt + 1}/${MAX_RETRIES} failed`,
        error,
      );

      if (attempt < MAX_RETRIES - 1) {
        await sleep(computeBackoffDelay(error, attempt, INITIAL_RETRY_DELAY_MS));
      }
    }
  }

  // Fail-open: return null to signal the batch should keep original descriptions
  logWarn("description-generator", "All attempts failed — keeping original descriptions", {
    attempts: MAX_RETRIES,
    batchSize: grants.length,
  });
  return null;
}

/**
 * Generate clear, helpful descriptions for validated grants using AI.
 *
 * Fail-open: if description generation fails for a batch, the original
 * scraped descriptions are kept. Original descriptions are preserved
 * in rawData.originalDescription for auditability.
 */
function applyBatchResults(
  batch: GrantData[],
  results: Array<{ index: number; description: string }>,
): number {
  let rewritten = 0;
  for (const result of results) {
    const grant = batch[result.index];
    if (!grant) continue;

    const rawData = grant.rawData ?? {};
    rawData.originalDescription = grant.description;
    grant.rawData = rawData;

    grant.description = result.description;
    rewritten++;
  }
  return rewritten;
}

export async function generateDescriptions(
  grants: GrantData[],
  opts: { budget?: IntegrationBudget } = {},
): Promise<GrantData[]> {
  if (!env.ANTHROPIC_API_KEY) {
    log("description-generator", "ANTHROPIC_API_KEY not set — skipping description generation");
    return grants;
  }

  if (grants.length === 0) return grants;

  log("description-generator", `Generating descriptions for ${grants.length} grants`);

  let rewritten = 0;

  for (let i = 0; i < grants.length; i += DESCRIPTION_BATCH_SIZE) {
    if (opts.budget && !opts.budget.canCallAI()) {
      log("description-generator", "Budget exhausted — skipping remaining batches", {
        processed: i,
        total: grants.length,
      });
      break;
    }

    const batch = grants.slice(i, i + DESCRIPTION_BATCH_SIZE);
    opts.budget?.recordAICall();
    const results = await generateBatchDescriptions(batch);

    if (results) {
      rewritten += applyBatchResults(batch, results);
    }

    if (i + DESCRIPTION_BATCH_SIZE < grants.length) {
      await new Promise((r) => setTimeout(r, AI_CALL_DELAY_MS));
    }
  }

  log("description-generator", "Description generation complete", {
    rewritten,
    keptOriginal: grants.length - rewritten,
  });
  return grants;
}
