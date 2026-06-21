import Anthropic from "@anthropic-ai/sdk";
import type { CreateMessageFn } from "./generateSection";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the server environment — never the browser (§3, §10.1).
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Real Structured Outputs call (§10.1). `output_config.format` is the current,
 * GA surface (the old top-level `output_format` is deprecated). Called directly
 * on `client.messages` so the SDK keeps its internal `this` binding.
 */
export const anthropicCreateMessage: CreateMessageFn = async ({ model, system, user, schema }) => {
  const response = await getClient().messages.create({
    model,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: { type: "json_schema", schema } },
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
};
