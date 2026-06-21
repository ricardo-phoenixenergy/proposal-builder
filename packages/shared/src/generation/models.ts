/**
 * Models the user can pick from in the frontend settings. One source of truth:
 * the inspector dropdown renders this list, and the server validates the
 * incoming `model` against it (never passes an arbitrary client string to the
 * Anthropic API). IDs are exact — no date suffixes.
 */
export const SELECTABLE_MODELS = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 — highest quality" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 — fast & cheaper" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — fastest" },
] as const;

export type GenerationModelId = (typeof SELECTABLE_MODELS)[number]["id"];

export const DEFAULT_MODEL: GenerationModelId = "claude-opus-4-8";

export function isSelectableModel(id: unknown): id is GenerationModelId {
  return typeof id === "string" && SELECTABLE_MODELS.some((m) => m.id === id);
}
