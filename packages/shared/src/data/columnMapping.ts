import type { Dataset } from "../types/data";

export interface ChartSeries {
  key: string;
  label: string;
  data: number[];
}
export interface ChartData {
  categories: string[];
  series: ChartSeries[];
}
export type ColumnMapping = NonNullable<Dataset["mapping"]>;

/**
 * Sensible default mapping (§6.3): categories = first text column, values = the
 * numeric columns. Keeps column-mapping invisible most of the time.
 */
export function defaultMapping(dataset: Dataset): ColumnMapping {
  const category = dataset.columns.find((c) => c.type === "text");
  const values = dataset.columns.filter((c) => c.type === "number").map((c) => c.key);
  const mapping: ColumnMapping = { valueColumns: values };
  if (category) mapping.categoryColumn = category.key;
  return mapping;
}

/**
 * Project a dataset through a mapping into chart-ready categories + series. One
 * series per value column; rows are aligned by index. The chart components read
 * this — they never see the raw Dataset.
 */
export function toChartSeries(dataset: Dataset, mapping: ColumnMapping): ChartData {
  const categoryKey = mapping.categoryColumn;
  const categories = categoryKey ? dataset.rows.map((r) => String(r[categoryKey] ?? "")) : [];

  const valueKeys = mapping.valueColumns ?? [];
  const series: ChartSeries[] = valueKeys.map((key) => {
    const col = dataset.columns.find((c) => c.key === key);
    return {
      key,
      label: col?.label ?? key,
      data: dataset.rows.map((r) => Number(r[key]) || 0),
    };
  });

  return { categories, series };
}
