export interface AnthropicLike {
  stop_reason?: string | null;
  content: { type: string; text?: string }[];
}

/**
 * Turn a Messages response into JSON text, or throw a user-safe error.
 * Surfaces the two silent-failure modes the old code missed: truncation
 * (max_tokens) and refusal. Messages here are safe to show a user.
 */
export function interpretAnthropicResponse(res: AnthropicLike): string {
  if (res.stop_reason === "refusal") {
    throw new Error("The model declined to generate this content. Try rephrasing the brief.");
  }
  if (res.stop_reason === "max_tokens") {
    throw new Error(
      "The response hit the length limit. Shorten the brief or reduce the section's fields, then retry.",
    );
  }
  const text = res.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
  if (text.trim() === "") {
    throw new Error("The model returned an empty response. Please retry.");
  }
  return text;
}
