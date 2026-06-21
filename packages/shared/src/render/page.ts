/** Fixed page geometry for the paged document model (§10.3). A4 portrait, mm. */
export const PAGE = { size: "A4", widthMm: 210, heightMm: 297, marginMm: 18 } as const;

/** A selectable page format (§J): physical size + print margin, in millimetres. */
export interface PageFormat {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  marginMm: number;
}

/** The v1 formats. Slides use a 0 margin (the layout owns the bleed). */
export const PAGE_FORMATS: PageFormat[] = [
  { id: "a4_portrait", label: "A4 portrait", widthMm: 210, heightMm: 297, marginMm: 18 },
  { id: "a4_landscape", label: "A4 landscape", widthMm: 297, heightMm: 210, marginMm: 18 },
  { id: "letter_portrait", label: "Letter", widthMm: 215.9, heightMm: 279.4, marginMm: 18 },
  { id: "widescreen_16_9", label: "16:9 slide", widthMm: 338.67, heightMm: 190.5, marginMm: 0 },
  { id: "standard_4_3", label: "4:3 slide", widthMm: 254, heightMm: 190.5, marginMm: 0 },
];

export const DEFAULT_PAGE_FORMAT = "a4_portrait";

/** Resolve a format id; unknown/undefined → the default (A4 portrait). */
export function getPageFormat(id: string | undefined): PageFormat {
  return PAGE_FORMATS.find((f) => f.id === id) ?? PAGE_FORMATS[0]!;
}

/** The print `@page` rule for a format. `preferCSSPageSize` makes Chromium honour it. */
export function pageCss(fmt: PageFormat): string {
  return `@page { size: ${fmt.widthMm}mm ${fmt.heightMm}mm; margin: ${fmt.marginMm}mm; }`;
}
