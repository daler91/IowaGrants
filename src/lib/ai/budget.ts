import { logWarn } from "@/lib/errors";

/**
 * Per-run budget manager for AI API calls.
 * Short-circuits when the maximum number of calls is exhausted.
 */
export class IntegrationBudget {
  private aiCalls = 0;

  constructor(private readonly maxAiCalls: number) {}

  canCallAI(): boolean {
    return this.aiCalls < this.maxAiCalls;
  }

  recordAICall(): void {
    this.aiCalls++;
    if (!this.canCallAI()) {
      logWarn("integration-budget", "AI call budget exhausted", {
        used: this.aiCalls,
        max: this.maxAiCalls,
      });
    }
  }

  get remaining(): number {
    return Math.max(0, this.maxAiCalls - this.aiCalls);
  }

  get used(): number {
    return this.aiCalls;
  }
}
