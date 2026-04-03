import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import type { GrantData } from "@/lib/types";

const anthropic = new Anthropic();

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

interface ParsedGrant {
  title: string;
  description: string;
  amountMin: number | null;
  amountMax: number | null;
  deadline: string | null;
  eligibility: string | null;
  grantType: string;
  businessStage: string;
  gender: string;
  locations: string[];
  industries: string[];
  eligibleExpenses: string[];
  categories: string[];
}

function mapParsedToGrantData(
  parsed: ParsedGrant,
  sourceUrl: string,
  sourceName: string,
  pdfUrl?: string
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
    deadline: parsed.deadline ? new Date(parsed.deadline) : undefined,
    eligibility: parsed.eligibility || undefined,
    grantType: (parsed.grantType as GrantData["grantType"]) || "STATE",
    status: "OPEN",
    businessStage:
      (parsed.businessStage as GrantData["businessStage"]) || "BOTH",
    gender: (parsed.gender as GrantData["gender"]) || "ANY",
    locations:
      parsed.locations.length > 0 ? parsed.locations : ["Iowa"],
    industries: parsed.industries,
    pdfUrl,
    rawData: parsed as unknown as Record<string, unknown>,
    categories: parsed.categories,
    eligibleExpenses: parsed.eligibleExpenses,
  };
}

export async function parsePdfFromUrl(
  pdfUrl: string,
  sourceName: string
): Promise<GrantData | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[pdf-parser] ANTHROPIC_API_KEY not set — skipping PDF parse");
    return null;
  }

  try {
    // Download the PDF
    const pdfResponse = await axios.get(pdfUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
      headers: {
        "User-Agent": "IowaGrantScanner/1.0 (educational research project)",
      },
    });

    const pdfBase64 = Buffer.from(pdfResponse.data).toString("base64");

    // Send to Claude with vision for table extraction
    const message = await anthropic.messages.create({
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
    });

    const textContent = message.content.find((c) => c.type === "text");
    if (textContent?.type !== "text") {
      console.error("[pdf-parser] No text response from Claude");
      return null;
    }

    const parsed: ParsedGrant = JSON.parse(textContent.text);
    const grant = mapParsedToGrantData(parsed, pdfUrl, sourceName, pdfUrl);

    console.log(`[pdf-parser] Successfully parsed: ${grant.title}`);
    return grant;
  } catch (error) {
    console.error(
      `[pdf-parser] Error parsing ${pdfUrl}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

export async function parseTextWithAI(
  text: string,
  sourceUrl: string,
  sourceName: string
): Promise<GrantData | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[pdf-parser] ANTHROPIC_API_KEY not set — skipping AI parse");
    return null;
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `${EXTRACTION_PROMPT}\n\nHere is the grant program text:\n\n${text.slice(0, 10000)}`,
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === "text");
    if (textContent?.type !== "text") return null;

    const parsed: ParsedGrant = JSON.parse(textContent.text);
    return mapParsedToGrantData(parsed, sourceUrl, sourceName);
  } catch (error) {
    console.error(
      `[pdf-parser] Error parsing text from ${sourceUrl}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
