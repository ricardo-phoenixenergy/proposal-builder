import type { CSSProperties, ReactNode } from "react";
import type { ThemeTokens } from "@proposal/shared";

/**
 * The token → CSS-variable contract. Components read ONLY these variables for
 * colour/type/spacing (§4.3), so changing a token re-skins the whole document
 * with no content re-render.
 */
export function themeToCssVars(theme: ThemeTokens): CSSProperties {
  return {
    "--c-primary": theme.colors.primary,
    "--c-accent": theme.colors.accent,
    "--c-text": theme.colors.text,
    "--c-muted": theme.colors.muted,
    "--c-surface": theme.colors.surface,
    "--c-line": theme.colors.line,
    "--f-heading": theme.fonts.heading,
    "--f-body": theme.fonts.body,
    "--radius": `${theme.radius}px`,
    "--space": String(theme.spacing),
  } as CSSProperties;
}

export function ThemeProvider({
  theme,
  children,
}: {
  theme: ThemeTokens;
  children: ReactNode;
}) {
  return (
    <div data-theme={theme.id} style={themeToCssVars(theme)}>
      {children}
    </div>
  );
}
