/**
 * Canonical data shapes (§14.1).
 *
 * A `Dataset` is entered once (paste / import / grid / AI) and rendered many
 * ways — table or chart variants are views of the same data (§6.2).
 * A `ComparisonMatrix` is the options × metrics shape for `commercial_comparison`
 * (§6.6); every option declares the same metric list so columns line up.
 */

export interface DatasetColumn {
  key: string;
  label: string;
  type: "text" | "number";
}

export interface Dataset {
  columns: DatasetColumn[];
  rows: Record<string, string | number>[];
  mapping?: {
    categoryColumn?: string;
    valueColumns?: string[];
  };
  chartType?: "bar" | "line" | "pie" | "area";
}

export interface ComparisonOption {
  name: string;
  /** Keyed by metric name; value or "—" for not-applicable cells. */
  values: Record<string, string>;
}

export interface ComparisonMatrix {
  metrics: string[];
  options: ComparisonOption[];
}
