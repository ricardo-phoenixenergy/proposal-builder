/**
 * Section-type schema and content envelope (§14.1).
 *
 * A `SectionTypeSchema` is the single source of truth for one section TYPE
 * (held in app code, not the DB — §12). The runtime JSON Schema used for Ajv
 * validation is DERIVED from these definitions (see ../schema), so the two
 * representations cannot drift (§5.1).
 */

export type FieldType = "text" | "paragraph" | "dataset" | "matrix" | "list";

export interface FieldSchema {
  key: string;
  type: FieldType;
  label?: string;
  required?: boolean;
  /** text: maximum characters (enforced in JSON Schema as maxLength). */
  maxChars?: number;
  /** paragraph: maximum words (enforced in the app validation layer). */
  maxWords?: number;
  /** dataset: maximum rows. */
  maxRows?: number;
  /** dataset | matrix: maximum columns / options. */
  maxColumns?: number;
  /** dataset: maximum chartable series. */
  maxSeries?: number;
}

/** Soft, per-field recommended bounds for a given variant (warnings, not gate errors). */
export interface VariantRange {
  maxChars?: number;
  maxWords?: number;
}

export interface SectionTypeSchema {
  /** e.g. "executive_summary", "commercial_comparison". */
  type: string;
  label: string;
  category: "text" | "data";
  fields: FieldSchema[];
  /** Registered layout keys; [] → fallback renderer only (§5.4). */
  variants: string[];
  defaultVariant?: string;
  /**
   * Optional advisory content ranges per variant, keyed variant → fieldKey.
   * These produce live *warnings* when a layout is tighter than the hard field
   * limit (e.g. a banner fits less than a standard block) — never gate errors.
   */
  variantRanges?: Record<string, Record<string, VariantRange>>;
  /** Bumped on field changes; used for component/schema drift checks (§5.4). */
  schemaVersion: number;
  /** Hidden from authoring/add-section pickers but still rendered/validated (§11 Builder). */
  deprecated?: boolean;
}

/**
 * A single section instance — the CONTENT envelope. `data` is intentionally
 * loosely typed: its shape is validated at runtime against the section type's
 * fields, never at compile time (the AI emits arbitrary JSON).
 */
export interface Section {
  id: string;
  /** References a SectionTypeSchema by `type`. */
  type: string;
  /** Chosen layout; absent → defaultVariant or fallback. */
  variant?: string;
  data: Record<string, unknown>;
  /** Per-field lock state, merged from the template (§7). */
  locked?: Record<string, boolean>;
  /** Force this section to start on a new page in the paged model (§10.3). */
  pageBreakBefore?: boolean;
}
