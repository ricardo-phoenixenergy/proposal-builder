import type { ProposalDocument, ThemeTokens } from "@proposal/shared";

/** The theme the PDF renders: the forked document.theme, else the preset by id, else fallback. */
export function resolvePrintTheme(
  document: ProposalDocument,
  presets: ThemeTokens[],
  fallback: ThemeTokens,
): ThemeTokens {
  return document.theme ?? presets.find((t) => t.id === document.themeId) ?? fallback;
}
