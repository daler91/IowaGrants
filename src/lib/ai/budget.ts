import { logWarn } from "@/lib/errors";

interface UsageLike {
  input_tokens?: number;
  output_tokens?: number;
}

/**
 * Per-run budget manager for AI API calls.
 * Tracks both call count and token usage so operators can reason about
 * cost for batched PDF parses, which have highly variable token spend.
 */
export class IntegrationBudget {
  private aiCalls = 0;
  private inputTokens = 0;
  private outputTokens = 0;

  constructor(private readonly maxAiCalls: number) {}

  canCallAI(): boolean {
    return this.aiCalls < this.maxAiCalls;
  }

  /**
   * Record an AI call. Increments the call counter and, if `usage` is
   * provided, accumulates token consumption too. Callers that only learn
   * usage after the response can call `recordTokens` separately.
   */
  recordAICall(usage?: UsageLike | null): void {
    this.aiCalls++;
    if (usage) this.recordTokens(usage);
    if (!this.canCallAI()) {
      logWarn("integration-budget", "AI call budget exhausted", {
        used: this.aiCalls,
        max: this.maxAiCalls,
        inputTokens: this.inputTokens,
        outputTokens: this.outputTokens,
      });
    }
  }

  /** Add post-response token counts for an already-recorded call. */
  recordTokens(usage: UsageLike | null | undefined): void {
    if (!usage) return;
    if (typeof usage.input_tokens === "number") this.inputTokens += usage.input_tokens;
    if (typeof usage.output_tokens === "number") this.outputTokens += usage.output_tokens;
  }

  get remaining(): number {
    return Math.max(0, this.maxAiCalls - this.aiCalls);
  }

  get used(): number {
    return this.aiCalls;
  }

  get totalTokens(): number {
    return this.inputTokens + this.outputTokens;
  }

  get tokensBreakdown(): { input: number; output: number; total: number } {
    return {
      input: this.inputTokens,
      output: this.outputTokens,
      total: this.inputTokens + this.outputTokens,
    };
  }
}
