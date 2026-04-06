import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let anthropic: Anthropic | null = null;

/** Lazy-init Anthropic client — only created on first use. */
export function getAnthropic(): Anthropic {
  if (!anthropic) {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    anthropic = new Anthropic({ apiKey });
  }
  return anthropic;
}
