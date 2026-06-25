/**
 * Declarative section-layout model (§A). A layout is a tree of token-styled
 * blocks, interpreted by a safe renderer — never executed. The vocabulary const
 * arrays are the validator's source of truth; the union types derive from them so
 * the two cannot drift.
 */

export const TOKEN_COLORS = ["primary", "accent", "text", "muted", "surface", "line"] as const;
export const TOKEN_FONTS = ["heading", "body"] as const;
export const SIZE_SCALES = ["xs", "sm", "md", "lg", "xl"] as const;
export const SPACE_SCALES = ["none", "xs", "sm", "md", "lg", "xl"] as const;
export const ALIGNS = ["left", "center", "right"] as const;
export const WEIGHTS = ["regular", "medium", "bold"] as const;
export const CHART_KINDS = ["bar", "line", "pie", "area"] as const;

export type TokenColor = (typeof TOKEN_COLORS)[number];
export type TokenFont = (typeof TOKEN_FONTS)[number];
export type SizeScale = (typeof SIZE_SCALES)[number];
export type SpaceScale = (typeof SPACE_SCALES)[number];
export type Align = (typeof ALIGNS)[number];
export type Weight = (typeof WEIGHTS)[number];
export type LayoutChartKind = (typeof CHART_KINDS)[number];

export interface BlockStyle {
  color?: TokenColor;
  background?: TokenColor;
  font?: TokenFont;
  size?: SizeScale;
  weight?: Weight;
  align?: Align;
  padding?: SpaceScale;
}

export type LeafBlock =
  | { kind: "heading"; field: string; style?: BlockStyle }
  | { kind: "paragraph"; field: string; style?: BlockStyle }
  | { kind: "list"; field: string; style?: BlockStyle }
  | { kind: "keyValue"; fields: string[]; style?: BlockStyle }
  | { kind: "table"; field: string; style?: BlockStyle }
  | { kind: "chart"; field: string; chart: LayoutChartKind; style?: BlockStyle }
  | { kind: "matrix"; field: string; style?: BlockStyle }
  | { kind: "image"; field: string; style?: BlockStyle }
  | { kind: "logo"; style?: BlockStyle }
  | { kind: "divider"; style?: BlockStyle }
  | { kind: "callout"; text: string; style?: BlockStyle }
  | { kind: "text"; text: string; style?: BlockStyle };

/** A background image is a fixed asset URL OR a bound per-proposal image field (§I). */
export type ImageRef = { assetUrl: string } | { field: string };

export interface BlockBackground {
  image?: ImageRef;
  overlay?: { color: TokenColor; opacity: number }; // opacity 0..100, brand-token tint
  position?: "cover" | "contain";
  minHeight?: SizeScale | "page"; // "page" → the document format's content height (§J)
}

export type ContainerBlock =
  | {
      kind: "stack";
      gap?: SpaceScale;
      style?: BlockStyle;
      background?: BlockBackground;
      children: Block[];
    }
  | {
      kind: "columns";
      gap?: SpaceScale;
      widths?: number[];
      style?: BlockStyle;
      background?: BlockBackground;
      columns: Block[][];
    };

export type Block = LeafBlock | ContainerBlock;

export const LEAF_KINDS = [
  "heading",
  "paragraph",
  "list",
  "keyValue",
  "table",
  "chart",
  "matrix",
  "image",
  "logo",
  "divider",
  "callout",
  "text",
] as const;
export const CONTAINER_KINDS = ["stack", "columns"] as const;

export interface SectionLayout {
  type: string; // section-type key
  variant: string; // design-identity slug
  pageFormat: string; // the page format this layout is designed for (§J)
  name: string; // display label
  version: number;
  /** Template layout (current): authored HTML with {{…}} placeholders. */
  template?: string;
  /** Template layout: authored CSS, scoped at render time. */
  css?: string;
  /** Legacy block layout (read-only; no longer authored). */
  root?: Block;
}
