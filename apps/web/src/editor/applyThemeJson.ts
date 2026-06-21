import { validateTheme, type ThemeTokens, type ValidationError } from "@proposal/shared";

export type ApplyThemeResult =
  | { ok: true; theme: ThemeTokens }
  | { ok: false; errors: ValidationError[] };

/**
 * The pure half of the live-edit pipeline (§8): parse text, validate against the
 * theme schema, and return either the theme or field-pointed errors. No React,
 * no store — so it's fully unit-testable.
 */
export function applyThemeJson(text: string): ApplyThemeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      errors: [{ path: "", message: e instanceof Error ? e.message : "Invalid JSON", source: "schema" }],
    };
  }

  const result = validateTheme(parsed);
  if (!result.valid) return { ok: false, errors: result.errors };
  return { ok: true, theme: parsed as ThemeTokens };
}
