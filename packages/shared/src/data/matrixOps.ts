import type { ComparisonMatrix } from "../types/data";

const NA = "—";

/** Append an option (column), N/A for every existing metric (§6.6). */
export function addOption(matrix: ComparisonMatrix, name: string): ComparisonMatrix {
  const values: Record<string, string> = {};
  for (const metric of matrix.metrics) values[metric] = NA;
  return { ...matrix, options: [...matrix.options, { name, values }] };
}

/** Remove the option at `index`. */
export function removeOption(matrix: ComparisonMatrix, index: number): ComparisonMatrix {
  return { ...matrix, options: matrix.options.filter((_, i) => i !== index) };
}

/** Append a metric (row), filling N/A across every option. */
export function addMetric(matrix: ComparisonMatrix, name: string): ComparisonMatrix {
  return {
    ...matrix,
    metrics: [...matrix.metrics, name],
    options: matrix.options.map((o) => ({ ...o, values: { ...o.values, [name]: NA } })),
  };
}

/** Remove a metric (row) and drop it from every option's values. */
export function removeMetric(matrix: ComparisonMatrix, name: string): ComparisonMatrix {
  return {
    ...matrix,
    metrics: matrix.metrics.filter((m) => m !== name),
    options: matrix.options.map((o) => {
      const values = { ...o.values };
      delete values[name];
      return { ...o, values };
    }),
  };
}
