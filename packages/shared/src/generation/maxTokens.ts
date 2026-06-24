import type { SectionTypeSchema } from "../types/section";
import { fieldKind } from "./generationSchema";

const CHARS_PER_TOKEN = 3.5;
const JSON_OVERHEAD_TOKENS = 256;
const FLOOR = 1024;
const CEILING = 8192;
const DEFAULT_FIELD_CHARS = 600;

/**
 * Estimate a safe `max_tokens` for generating one section's data, derived from
 * the section's own field limits so multi-paragraph types don't truncate.
 * Only AI-composable fields contribute (data/image fields aren't generated).
 */
export function estimateMaxOutputTokens(typeSchema: SectionTypeSchema): number {
  let chars = 0;
  for (const field of typeSchema.fields) {
    if (fieldKind(field) !== "ai") continue;
    chars += field.maxChars ?? (field.maxWords !== undefined ? field.maxWords * 6 : DEFAULT_FIELD_CHARS);
  }
  const tokens = Math.ceil(chars / CHARS_PER_TOKEN) + JSON_OVERHEAD_TOKENS;
  return Math.min(CEILING, Math.max(FLOOR, tokens));
}
