/**
 * Theme tokens (§14.1). Presentation-layer style only — colours, fonts, spacing.
 * Components never hardcode these; they resolve them to CSS variables. A theme
 * change re-skins the document with no content re-render.
 */
export interface ThemeTokens {
  id: string;
  name: string;
  colors: {
    primary: string;
    accent: string;
    text: string;
    muted: string;
    surface: string;
    line: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  /** Corner radius in px. */
  radius: number;
  /** Spacing scale multiplier; 1.0 = base. */
  spacing: number;
  logoUrl?: string;
}
