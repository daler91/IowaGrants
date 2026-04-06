import Anthropic from "@anthropic-ai/sdk";

let anthropic: Anthropic | null = null;

/** Lazy-init Anthropic client — only created on first use. */
export function getAnthropic(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic();
  }
  return anthropic;
}
