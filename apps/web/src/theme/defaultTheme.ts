import type { ThemeTokens } from "@proposal/shared";

/** A neutral default brand theme used by previews and tests. */
export const defaultTheme: ThemeTokens = {
  id: "theme_phoenix_default",
  name: "Phoenix Default",
  colors: {
    primary: "#0b5d3b",
    accent: "#f5a623",
    text: "#1a1a1a",
    muted: "#8a8a8a",
    surface: "#ffffff",
    line: "#e2e2e2",
  },
  fonts: {
    heading: "'Inter', sans-serif",
    body: "'Inter', sans-serif",
  },
  radius: 8,
  spacing: 1,
};
