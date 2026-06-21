import type { SectionTypeSchema } from "../types/section";

/**
 * Section-type registry — the single source of truth for what each section TYPE
 * allows (§5.1). The runtime JSON Schema is derived from these definitions
 * (../schema/section.schema.ts), so the two can never drift.
 *
 * Slice 1 ships the two canonical types from §14.2 plus a generic `text` type,
 * which is enough to author a realistic sample. The full catalogue grows in
 * later slices.
 */
const sectionTypeList: SectionTypeSchema[] = [
  {
    type: "text",
    label: "Text block",
    category: "text",
    fields: [
      { key: "heading", type: "text", label: "Heading", required: true, maxChars: 80 },
      { key: "body", type: "paragraph", label: "Body", required: true, maxWords: 200 },
    ],
    variants: ["standard"],
    defaultVariant: "standard",
    schemaVersion: 1,
  },
  {
    type: "executive_summary",
    label: "Executive summary",
    category: "text",
    fields: [
      { key: "heading", type: "text", label: "Heading", required: true, maxChars: 40 },
      { key: "body", type: "paragraph", label: "Body", required: true, maxWords: 150 },
    ],
    variants: ["standard", "banner"],
    defaultVariant: "standard",
    // The banner layout is a compact hero band: it fits far less than the
    // standard block's hard limits (40 chars / 150 words), so warn earlier.
    variantRanges: {
      banner: {
        heading: { maxChars: 32 },
        body: { maxWords: 45 },
      },
    },
    schemaVersion: 1,
  },
  {
    type: "commercial_comparison",
    label: "Commercial comparison",
    category: "data",
    fields: [
      {
        key: "matrix",
        type: "matrix",
        label: "Options × metrics",
        required: true,
        maxRows: 8, // metrics
        maxColumns: 4, // options
      },
    ],
    variants: ["table"],
    defaultVariant: "table",
    schemaVersion: 1,
  },
  {
    // §7.3: Capex and PPA are DISTINCT types (different fields) behind one choice
    // slot — not variants of one type.
    type: "pricing_capex",
    label: "Pricing — Capex",
    category: "text",
    fields: [
      { key: "upfrontCost", type: "text", label: "Upfront cost", required: true, maxChars: 40 },
      { key: "payback", type: "text", label: "Payback", required: true, maxChars: 40 },
      { key: "notes", type: "paragraph", label: "Notes", maxWords: 80 },
    ],
    variants: [],
    schemaVersion: 1,
  },
  {
    type: "pricing_ppa",
    label: "Pricing — PPA",
    category: "text",
    fields: [
      { key: "unitRate", type: "text", label: "Unit rate", required: true, maxChars: 40 },
      { key: "term", type: "text", label: "Term", required: true, maxChars: 40 },
      { key: "escalator", type: "text", label: "Escalator", maxChars: 40 },
      { key: "notes", type: "paragraph", label: "Notes", maxWords: 80 },
    ],
    variants: [],
    schemaVersion: 1,
  },
  {
    type: "data_table",
    label: "Data table / chart",
    category: "data",
    fields: [
      {
        key: "dataset",
        type: "dataset",
        label: "Dataset",
        required: true,
        maxRows: 50,
        maxColumns: 8,
        maxSeries: 6,
      },
    ],
    // One dataset, rendered as a table or any chart type (§6.2).
    variants: ["table", "bar", "line", "pie", "area"],
    defaultVariant: "table",
    schemaVersion: 1,
  },
];

/** The six code-owned, immutable built-ins. Authored types may override by key. */
export const builtInSectionTypes: SectionTypeSchema[] = sectionTypeList;

// The active registry is a single mutated Map so exported references stay stable.
const activeMap = new Map<string, SectionTypeSchema>();
let revision = 0;

function rebuild(authored: SectionTypeSchema[]): void {
  activeMap.clear();
  for (const t of builtInSectionTypes) activeMap.set(t.type, t);
  for (const t of authored) activeMap.set(t.type, t); // authored wins by key
  revision++;
}
rebuild([]); // initialise to built-ins

/** Replace the authored layer; built-ins are always present underneath. */
export function setActiveSectionTypes(authored: SectionTypeSchema[]): void {
  rebuild(authored);
}

/** Test seam: restore the registry to built-ins only. */
export function resetSectionTypesForTests(): void {
  rebuild([]);
}

/** Monotonic counter; bumps whenever the active set changes (used to recompile schemas). */
export function sectionTypeRevision(): number {
  return revision;
}

export function getSectionType(type: string): SectionTypeSchema | undefined {
  return activeMap.get(type);
}

/** All active types; hides deprecated unless asked. */
export function listSectionTypes(opts?: { includeDeprecated?: boolean }): SectionTypeSchema[] {
  const all = [...activeMap.values()];
  return opts?.includeDeprecated ? all : all.filter((t) => !t.deprecated);
}

/** All active types including deprecated (for schema derivation / rendering). */
export function activeSectionTypes(): SectionTypeSchema[] {
  return [...activeMap.values()];
}
