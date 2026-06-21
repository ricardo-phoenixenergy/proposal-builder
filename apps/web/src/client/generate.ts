import type { ValidationResult } from "@proposal/shared";

export interface SectionGenerationResult {
  ok: boolean;
  data?: Record<string, unknown>;
  validation?: ValidationResult;
  error?: string;
}

export interface FieldGenerationResult {
  ok: boolean;
  value?: unknown;
  validation?: ValidationResult;
  error?: string;
}

/** Section rewrite: redo all text fields. The model is the admin setting (server-side). */
export async function requestSectionGeneration(input: {
  type: string;
  brief: string;
  instruction?: string;
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
  return {
    ok: true,
    ...(body.data ? { data: body.data } : {}),
    ...(body.validation ? { validation: body.validation } : {}),
  };
}

/** Per-field rewrite: redo a single AI-composable field. */
export async function requestFieldGeneration(input: {
  type: string;
  fieldKey: string;
  brief: string;
  instruction?: string;
  currentValue?: string;
  sectionId?: string;
}): Promise<FieldGenerationResult> {
  const res = await fetch("/api/generate/field", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as {
    value?: unknown;
    validation?: ValidationResult;
    error?: string;
  };
  if (!res.ok) return { ok: false, error: body.error ?? `Request failed (${res.status})` };
  return {
    ok: true,
    value: body.value,
    ...(body.validation ? { validation: body.validation } : {}),
  };
}
