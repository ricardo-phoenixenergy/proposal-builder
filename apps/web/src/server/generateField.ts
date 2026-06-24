import {
  DEFAULT_MODEL,
  buildFieldGenerationSchema,
  estimateMaxOutputTokens,
  getSectionType,
  isSelectableModel,
  validateSection,
  type ValidationResult,
} from "@proposal/shared";
import { fieldRewritePrompt, systemPrompt } from "./prompts";
import type { CreateMessageFn } from "./generateSection";

export interface GenerateFieldInput {
  type: string;
  fieldKey: string;
  brief: string;
  instruction?: string;
  currentValue?: string;
  model?: string;
  sectionId?: string;
}

export interface GenerateFieldResult {
  ok: boolean;
  value?: unknown;
  validation?: ValidationResult;
  error?: string;
}

/** Generate one AI-composable field's value, then validate it against the field's limits (§9). */
export async function generateField(
  input: GenerateFieldInput,
  createMessage: CreateMessageFn,
): Promise<GenerateFieldResult> {
  const typeSchema = getSectionType(input.type);
  if (!typeSchema) return { ok: false, error: `Unknown section type: ${input.type}` };
  const field = typeSchema.fields.find((f) => f.key === input.fieldKey);
  if (!field) return { ok: false, error: `Unknown field: ${input.fieldKey}` };

  const schema = buildFieldGenerationSchema(field);
  if (schema === null) return { ok: false, error: "This field isn't AI-composable — edit it directly." };

  const model = isSelectableModel(input.model) ? input.model : DEFAULT_MODEL;

  let text: string;
  try {
    text = await createMessage({
      model,
      system: systemPrompt(),
      user: fieldRewritePrompt(field, input.brief, input.instruction ?? "", input.currentValue ?? ""),
      schema,
      maxOutputTokens: estimateMaxOutputTokens(typeSchema),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Generation failed" };
  }

  let value: unknown;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || !("value" in parsed)) {
      return { ok: false, error: "Model output missing a value" };
    }
    value = (parsed as { value: unknown }).value;
  } catch {
    return { ok: false, error: "Model output was not valid JSON" };
  }

  // Validate just this field by isolating errors whose path references the field key.
  const full = validateSection({ id: input.sectionId ?? "draft", type: input.type, data: { [input.fieldKey]: value } });
  const errors = full.errors.filter((e) => e.path.split("/").includes(input.fieldKey));
  return { ok: true, value, validation: { valid: errors.length === 0, errors } };
}
