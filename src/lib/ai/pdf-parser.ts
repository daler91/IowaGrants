import axios from "axios";
import type { GrantData } from "@/lib/types";
import { validateDeadline, isSafeUrl } from "@/lib/scrapers/utils";
import { env } from "@/lib/env";
import { SCRAPER_USER_AGENT } from "@/lib/scrapers/config";
import { log, logError, logWarn } from "@/lib/errors";
import { ParsedGrantSchema } from "./schemas";
import { getAnthropic } from "./client";

/**
 * Best-effort PII redaction applied to text before it leaves the system.
 * Currently targets US SSN-like `xxx-xx-xxxx` patterns; PDFs sent as
 * binary cannot be redacted here.
 */
// Linear-time pattern with bounded quantifiers — no ReDoS risk.
// NOSONAR: intentionally simple regex, reviewed for safety.
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
export function redactPII(text: string): string {
  if (!text) return text;
  return text.replaceAll(SSN_PATTERN, "[REDACTED-SSN]");
}

const EXTRACTION_PROMPT = `You are analyzing a grant program document. Extract the following information and return it as JSON:

{
  "title": "Grant program name",
  "description": "Brief description (2-3 sentences)",
  "amountMin": null or number (minimum award in dollars),
  "amountMax": null or number (maximum award in dollars),
  "deadline": null or "YYYY-MM-DD",
  "eligibility": "Who can apply (brief summary)",
  "grantType": "FEDERAL" | "STATE" | "LOCAL" | "PRIVATE",
  "businessStage": "STARTUP" | "EXISTING" | "BOTH",
  "gender": "WOMEN" | "VETERAN" | "MINORITY" | "GENERAL" | "ANY",
  "locations": ["Iowa counties or cities mentioned, or just 'Iowa'"],
  "industries": ["relevant industry sectors"],
  "eligibleExpenses": ["EQUIPMENT", "FACADE_IMPROVEMENT", "JOB_CREATION", "TECHNOLOGY", "WORKING_CAPITAL", "RESEARCH_DEVELOPMENT", "MARKETING_EXPORT"],
  "categories": ["relevant category tags"]
}

Only include eligible expenses that are explicitly mentioned. If information is not available, use null or empty arrays. Return ONLY valid JSON, no markdown.`;

import type { ParsedGrant } from "./schemas";

function mapParsedToGrantData(
  parsed: ParsedGrant,
  sourceUrl: string,
  sourceName: string,
  pdfUrl?: string,
): GrantData {
  return {
    title: parsed.title,
    description: parsed.description,
    sourceUrl,
    sourceName,
    amount:
      parsed.amountMin || parsed.amountMax
        ? `$${(parsed.amountMin || 0).toLocaleString()} - $${(parsed.amountMax || 0).toLocaleString()}`
        : undefined,
    amountMin: parsed.amountMin || undefined,
    amountMax: parsed.amountMax || undefined,
    deadline: parsed.deadline ? validateDeadline(new Date(parsed.deadline)) : undefined,
    eligibility: parsed.eligibility || undefined,
    grantType: (parsed.grantType as GrantData["grantType"]) || "STATE",
    status: "OPEN",
    businessStage: (parsed.businessStage as GrantData["businessStage"]) || "BOTH",
    gender: (parsed.gender as GrantData["gender"]) || "ANY",
    locations: parsed.locations.length > 0 ? parsed.locations : ["Iowa"],
    industries: parsed.industries,
    pdfUrl,
    rawData: parsed as unknown as Record<string, unknown>,
    categories: parsed.categories,
    eligibleExpenses: parsed.eligibleExpenses,
  };
}

export async function parsePdfFromUrl(
  pdfUrl: string,
  sourceName: string,
): Promise<GrantData | null> {
  if (!env.ANTHROPIC_API_KEY) {
    logWarn("pdf-parser", "ANTHROPIC_API_KEY not set — skipping PDF parse");
    return null;
  }

  try {
    // SSRF protection: reject internal/private URLs
    if (!isSafeUrl(pdfUrl)) {
      logWarn("pdf-parser", "Blocked unsafe URL", { url: pdfUrl });
      return null;
    }

    // Download the PDF (10 MB limit to prevent resource exhaustion)
    const MAX_PDF_SIZE = 10 * 1024 * 1024;
    const pdfResponse = await axios.get(pdfUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
      maxContentLength: MAX_PDF_SIZE,
      maxBodyLength: MAX_PDF_SIZE,
      headers: {
        "User-Agent": SCRAPER_USER_AGENT,
      },
    });

    if (pdfResponse.data.byteLength > MAX_PDF_SIZE) {
      logWarn("pdf-parser", "PDF too large, skipping", {
        url: pdfUrl,
        bytes: pdfResponse.data.byteLength,
      });
      return null;
    }

    const pdfBase64 = Buffer.from(pdfResponse.data).toString("base64");

    // Send to Claude with vision for table extraction (90s timeout for large PDFs)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    let message;
    try {
      message = await getAnthropic().messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "document",
                  source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data: pdfBase64,
                  },
                },
                {
                  type: "text",
                  text: EXTRACTION_PROMPT,
                },
              ],
            },
          ],
        },
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timeout);
    }

    const textContent = message.content.find((c) => c.type === "text");
    if (textContent?.type !== "text") {
      logError("pdf-parser", "No text response from Claude");
      return null;
    }

    const parsed = ParsedGrantSchema.parse(JSON.parse(textContent.text));
    const grant = mapParsedToGrantData(parsed, pdfUrl, sourceName, pdfUrl);

    log("pdf-parser", `Successfully parsed: ${grant.title}`);
    return grant;
  } catch (error) {
    logError("pdf-parser", `Error parsing ${pdfUrl}`, error);
    return null;
  }
}

export async function parseTextWithAI(
  text: string,
  sourceUrl: string,
  sourceName: string,
): Promise<GrantData | null> {
  if (!env.ANTHROPIC_API_KEY) {
    logWarn("pdf-parser", "ANTHROPIC_API_KEY not set — skipping AI parse");
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let message;
    try {
      const redacted = redactPII(text.slice(0, 10000));
      message = await getAnthropic().messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: `${EXTRACTION_PROMPT}\n\nHere is the grant program text:\n\n${redacted}`,
            },
          ],
        },
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timeout);
    }

    const textContent = message.content.find((c) => c.type === "text");
    if (textContent?.type !== "text") return null;

    const parsed = ParsedGrantSchema.parse(JSON.parse(textContent.text));
    return mapParsedToGrantData(parsed, sourceUrl, sourceName);
  } catch (error) {
    logError("pdf-parser", `Error parsing text from ${sourceUrl}`, error);
    return null;
  }
}
