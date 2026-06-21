import type { SectionTypeSchema } from "@proposal/shared";

/**
 * The backend owns the system prompt and brand-voice guidelines (§10.1). The AI
 * produces schema-conformant CONTENT only — never layout, styling, or markup.
 */
export function systemPrompt(): string {
  return [
    "You write brand-aligned B2B proposal copy for Phoenix Energy, a solar & storage provider.",
    "Voice: clear, confident, concrete, and specific; no marketing fluff, hype, or hedging.",
    "Output ONLY the content that fits the provided JSON schema — never HTML, CSS, markdown,",
    "styling, or layout instructions. Respect every stated length limit.",
  ].join(" ");
}

/** Per-section user prompt: the brief plus each field's type and limits. */
export function sectionUserPrompt(typeSchema: SectionTypeSchema, brief: string): string {
  const fields = typeSchema.fields
    .map((f) => {
      const limits: string[] = [];
      if (f.maxChars !== undefined) limits.push(`max ${f.maxChars} characters`);
      if (f.maxWords !== undefined) limits.push(`max ${f.maxWords} words`);
      return `- ${f.key} (${f.type})${limits.length ? `: ${limits.join(", ")}` : ""}`;
    })
    .join("\n");

  return [
    `Write the "${typeSchema.label}" section of a client proposal.`,
    "",
    "Brief:",
    brief,
    "",
    "Fields to produce:",
    fields,
    "",
    "Stay within every limit. Return only the fields above.",
  ].join("\n");
}
