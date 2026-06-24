/** Minimal structured logging seed (M-1). One line per AI call; JSON for log processors. */
export function logAiCall(event: {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  stopReason?: string | null;
  latencyMs: number;
  ok: boolean;
}): void {
  console.info(JSON.stringify({ kind: "ai_call", ...event }));
}
