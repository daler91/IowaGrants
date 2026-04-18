import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_INITIAL_DELAY_MS = 1000;

/**
 * Returns the sleep duration (ms) to wait before retrying after a failed
 * Anthropic call. Honors the Retry-After header on 429 responses, otherwise
 * uses exponential backoff: `initial * 2^attempt`.
 */
export function computeBackoffDelay(
  error: unknown,
  attempt: number,
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
): number {
  if (error instanceof Anthropic.RateLimitError) {
    const retryAfter = Number.parseInt(error.headers?.get?.("retry-after") ?? "5", 10);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return retryAfter * 1000;
    }
  }
  return initialDelayMs * 2 ** attempt;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
