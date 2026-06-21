import type { ThemeTokens } from "@proposal/shared";
import { defaultTheme } from "./defaultTheme";

/** A second brand theme so re-theming is visibly end-to-end (§13.3). */
export const midnightTheme: ThemeTokens = {
  id: "theme_midnight",
  name: "Midnight",
  colors: {
    primary: "#6c8cff",
    accent: "#ffba49",
    text: "#e8eaf0",
    muted: "#7a8094",
    surface: "#11141c",
    line: "#2a2f3d",
  },
  fonts: {
    heading: "'Inter', sans-serif",
    body: "'Inter', sans-serif",
  },
  radius: 12,
  spacing: 1,
};

export const themes: ThemeTokens[] = [defaultTheme, midnightTheme];
