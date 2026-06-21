import {
  DEFAULT_MODEL,
  buildGenerationDataSchema,
  getSectionType,
  isSelectableModel,
  validateSection,
  type ValidationResult,
} from "@proposal/shared";
import { sectionUserPrompt, systemPrompt } from "./prompts";

/**
 * Abstracts the Anthropic call so the orchestration is testable without the SDK
 * or an API key. Returns the raw JSON text the model produced under the
 * structured-output schema. The real implementation lives in anthropic.ts.
 */
export type CreateMessageFn = (args: {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
}) => Promise<string>;

export interface GenerateSectionInput {
  type: string;
  brief: string;
  model?: string;
  sectionId?: string;
}

export interface GenerateSectionResult {
  ok: boolean;
  /** The generated section data (replaces only this section's `data`). */
  data?: Record<string, unknown>;
  /** Validation against the type schema — over-limit output is flagged, not dropped. */
  validation?: ValidationResult;
  error?: string;
}

/**
 * Generate one text-category section's data via Structured Outputs, then
 * validate it against the type schema (§9). Data-category sections aren't
 * AI-generated — their data comes from the user (grid/import, §6.1).
 */
export async function generateSection(
  input: GenerateSectionInput,
  createMessage: CreateMessageFn,
): Promise<GenerateSectionResult> {
  const typeSchema = getSectionType(input.type);
  if (!typeSchema) return { ok: false, error: `Unknown section type: ${input.type}` };

  const dataSchema = buildGenerationDataSchema(typeSchema);
  if (typeSchema.category !== "text" || dataSchema === null) {
    return {
      ok: false,
      error: "AI draft isn't available for data sections — enter values via the grid or import.",
    };
  }

  const model = isSelectableModel(input.model) ? input.model : DEFAULT_MODEL;

  let text: string;
  try {
    text = await createMessage({
      model,
      system: systemPrompt(),
      user: sectionUserPrompt(typeSchema, input.brief),
      schema: dataSchema,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Generation failed" };
  }

  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: "Model output was not a JSON object" };
    }
    data = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, error: "Model output was not valid JSON" };
  }

  const validation = validateSection({ id: input.sectionId ?? "draft", type: input.type, data });
  return { ok: true, data, validation };
}
