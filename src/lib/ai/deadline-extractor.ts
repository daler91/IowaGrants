import Anthropic from "@anthropic-ai/sdk";
import type { GrantData } from "@/lib/types";
import { env } from "@/lib/env";
import { AI_CALL_DELAY_MS, DEADLINE_AI_BATCH_SIZE } from "@/lib/scrapers/config";
import { validateDeadline } from "@/lib/scrapers/parsing-utils";
import { log, logError } from "@/lib/errors";
import { DeadlineExtractionArraySchema, type DeadlineExtraction } from "./schemas";

const anthropic = new Anthropic();

const DEADLINE_PROMPT = `You are extracting application deadlines from scraped grant listings.

For each grant below, find the APPLICATION SUBMISSION DEADLINE — the last date by which an applicant must submit their application to be considered.

Rules:
- Return the date as "YYYY-MM-DD" or null if no clear submission deadline is stated.
- Do NOT return posted dates, event dates, award announcement dates, program start dates, or past application cycles.
- Prefer the nearest future date relative to TODAY's date (provided below).
- If the grant is described as rolling / ongoing / continuous with no firm date, return null.
- If multiple cycles are listed, return the next upcoming cycle's deadline.
- If a year is missing but a month/day is given, infer the next future occurrence.

Confidence:
- HIGH: The deadline is explicitly stated with a clear label (e.g. "Application deadline: March 15, 2026").
- MEDIUM: The deadline is implied or requires minor inference (e.g. "applications close next month", cycle inference).
- LOW: The deadline is ambiguous, conflicting, or you are guessing.

Return a JSON array of objects with: {index, deadline, confidence, reason}
Return ONLY valid JSON, no markdown code fences.`;

interface DeadlineExtractionInput {
  /** Caller-assigned index used to match the response back to the grant. */
  index: number;
  title: string;
  description: string;
  eligibility?: string;
  /** The current regex-extracted deadline, if any — given to Claude for verification. */
  currentDeadline?: Date;
}

function buildSnippet(input: DeadlineExtractionInput): string {
  const parts = [`[${input.index}] Title: ${input.title}`];
  if (input.currentDeadline) {
    parts.push(`Current extracted deadline: ${input.currentDeadline.toISOString().slice(0, 10)}`);
  }
  if (input.description) {
    parts.push(`Description: ${input.description.slice(0, 1500)}`);
  }
  if (input.eligibility) {
    parts.push(`Eligibility: ${input.eligibility.slice(0, 400)}`);
  }
  return parts.join("\n");
}

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

async function callClaudeForBatch(
  inputs: DeadlineExtractionInput[],
  today: Date,
): Promise<DeadlineExtraction[] | null> {
  const snippets = inputs.map(buildSnippet).join("\n\n---\n\n");
  const todayStr = today.toISOString().slice(0, 10);
  const message = `${DEADLINE_PROMPT}\n\nTODAY: ${todayStr}\n\n---\n\n${snippets}`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: message }],
      });

      const text = response.content[0]?.type === "text" ? response.content[0].text : "";
      const cleaned = text
        .replace(/^```(?:json)?\s*/m, "")
        .replace(/\s*```\s*$/m, "")
        .trim();
      return DeadlineExtractionArraySchema.parse(JSON.parse(cleaned));
    } catch (error) {
      logError(
        "deadline-extractor",
        `Batch extraction attempt ${attempt + 1}/${MAX_RETRIES} failed`,
        error,
      );
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, INITIAL_RETRY_DELAY_MS * 2 ** attempt));
      }
    }
  }

  return null;
}

export interface ExtractedDeadline {
  deadline: Date | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
}

/**
 * Run Claude-powered deadline extraction on a batch of grants.
 * Returns a parallel array — one result per input grant, in the same order.
 * Entries may be null if the batch failed after retries.
 */
export async function extractDeadlinesWithAI(
  grants: GrantData[],
  opts: { today?: Date } = {},
): Promise<Array<ExtractedDeadline | null>> {
  if (!env.ANTHROPIC_API_KEY) {
    log("deadline-extractor", "ANTHROPIC_API_KEY not set — skipping AI deadline extraction");
    return grants.map(() => null);
  }
  if (grants.length === 0) return [];

  const today = opts.today ?? new Date();
  const results: Array<ExtractedDeadline | null> = grants.map(() => null);

  log("deadline-extractor", `Extracting deadlines for ${grants.length} grants with AI`);

  for (let batchStart = 0; batchStart < grants.length; batchStart += DEADLINE_AI_BATCH_SIZE) {
    const batch = grants.slice(batchStart, batchStart + DEADLINE_AI_BATCH_SIZE);
    const inputs: DeadlineExtractionInput[] = batch.map((g, i) => ({
      index: i,
      title: g.title,
      description: g.description,
      eligibility: g.eligibility,
      currentDeadline: g.deadline,
    }));

    const extracted = await callClaudeForBatch(inputs, today);
    if (extracted) {
      for (const item of extracted) {
        if (item.index < 0 || item.index >= batch.length) continue;
        const parsed = item.deadline ? new Date(`${item.deadline}T00:00:00Z`) : null;
        const valid = parsed ? (validateDeadline(parsed) ?? null) : null;
        results[batchStart + item.index] = {
          deadline: valid,
          confidence: item.confidence,
          reason: item.reason,
        };
      }
    }

    if (batchStart + DEADLINE_AI_BATCH_SIZE < grants.length) {
      await new Promise((r) => setTimeout(r, AI_CALL_DELAY_MS));
    }
  }

  return results;
}
