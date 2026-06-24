import Anthropic from "@anthropic-ai/sdk";
import type { CreateMessageFn } from "./generateSection";
import type { AnthropicLike } from "./anthropicResponse";
import { interpretAnthropicResponse } from "./anthropicResponse";
import { logAiCall } from "./observability";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the server environment — never the browser (§3, §10.1).
  // maxRetries gives exponential backoff on 429/5xx (H-2).
  if (!client) client = new Anthropic({ maxRetries: 3 });
  return client;
}

export const anthropicCreateMessage: CreateMessageFn = async ({
  model,
  system,
  user,
  schema,
  maxOutputTokens,
}) => {
  const startedAt = Date.now();
  try {
    const response = await getClient().messages.create({
      model,
      max_tokens: maxOutputTokens,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema } },
    });
    const text = interpretAnthropicResponse(response as unknown as AnthropicLike);
    logAiCall({
      model,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      stopReason: response.stop_reason,
      latencyMs: Date.now() - startedAt,
      ok: true,
    });
    return text;
  } catch (e) {
    logAiCall({ model, latencyMs: Date.now() - startedAt, ok: false });
    // interpret* errors are already user-safe; rethrow them verbatim. Anything
    // else (network/SDK) is logged above and replaced with a generic message (H-2).
    if (e instanceof Error && /declined|length limit|empty response/i.test(e.message)) throw e;
    throw new Error("The AI service is temporarily unavailable. Please try again.");
  }
};
