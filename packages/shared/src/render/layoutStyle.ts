import type { BlockStyle, SizeScale, SpaceScale, Weight } from "../types/layout";

/** size scale → font-size rem (§A). */
const SIZE_REM: Record<SizeScale, number> = { xs: 0.8, sm: 0.9, md: 1, lg: 1.35, xl: 1.9 };
/** SpaceScale → base px (multiplied by the theme --space at compile time). */
const SPACE_PX: Record<SpaceScale, number> = { none: 0, xs: 4, sm: 8, md: 16, lg: 24, xl: 40 };
/** weight token → numeric font-weight. */
const WEIGHT_N: Record<Weight, number> = { regular: 400, medium: 550, bold: 700 };

/** A SpaceScale as a theme-aware length: `calc(<px> * var(--space))`. */
export function spaceToken(scale: SpaceScale): string {
  return `calc(${SPACE_PX[scale]}px * var(--space))`;
}

/**
 * Compile a token-only BlockStyle into inline CSS (string values only). Every
 * value resolves to a theme CSS variable or a fixed scale unit — never a raw
 * colour/length — so brand consistency is structural. Returns a plain map the
 * renderer spreads into `style`.
 */
export function compileBlockStyle(style?: BlockStyle): Record<string, string> {
  const css: Record<string, string> = {};
  if (!style) return css;
  if (style.color) css.color = `var(--c-${style.color})`;
  if (style.background) css.background = `var(--c-${style.background})`;
  if (style.font) css.fontFamily = `var(--f-${style.font})`;
  if (style.size) css.fontSize = `${SIZE_REM[style.size]}rem`;
  if (style.weight) css.fontWeight = String(WEIGHT_N[style.weight]);
  if (style.align) css.textAlign = style.align;
  if (style.padding) css.padding = spaceToken(style.padding);
  return css;
}
