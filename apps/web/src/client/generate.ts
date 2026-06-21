import type { ValidationResult } from "@proposal/shared";

export interface SectionGenerationResult {
  ok: boolean;
  data?: Record<string, unknown>;
  validation?: ValidationResult;
  error?: string;
}

/**
 * Client → backend proxy call to generate one section's data. The browser never
 * talks to Anthropic directly (§3); it posts the chosen model + brief to our
 * Route Handler, which holds the key.
 */
export async function requestSectionGeneration(input: {
  type: string;
  brief: string;
  model: string;
  sectionId?: string;
}): Promise<SectionGenerationResult> {
  const res = await fetch("/api/generate/section", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: Record<string, unknown>;
    validation?: ValidationResult;
    error?: string;
  };
  if (!res.ok) return { ok: false, error: body.error ?? `Request failed (${res.status})` };
  return { ok: true, ...(body.data ? { data: body.data } : {}), ...(body.validation ? { validation: body.validation } : {}) };
}
