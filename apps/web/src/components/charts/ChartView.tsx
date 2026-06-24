"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { defaultMapping, toChartSeries, type Dataset, type ThemeTokens } from "@proposal/shared";
import type { SectionComponentProps } from "../../registry/registry.types";

export type ChartKind = "bar" | "line" | "pie" | "area";

function isDataset(value: unknown): value is Dataset {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v["columns"]) && Array.isArray(v["rows"]);
}

/** Series colours come from the theme object (§6.4 — charts need concrete values). */
function palette(theme: ThemeTokens): string[] {
  return [
    theme.colors.primary,
    theme.colors.accent,
    theme.colors.text,
    theme.colors.muted,
    theme.colors.line,
  ];
}

/**
 * Token-aware chart wrapper (§6.4): Recharts is an implementation detail behind a
 * component that reads the dataset (via the shared mapping helpers) and the theme.
 * Fixed width/height keeps it deterministic — including under jsdom and in the
 * Chromium PDF; a responsive container can wrap this later.
 */
export function ChartView({
  data,
  theme,
  kind,
  width = 600,
  height = 320,
}: SectionComponentProps & { kind: ChartKind; width?: number; height?: number }) {
  const ds = data["dataset"];
  if (!isDataset(ds)) return <div data-empty="true" />;

  const mapping = ds.mapping ?? defaultMapping(ds);
  const { categories, series } = toChartSeries(ds, mapping);
  const colors = palette(theme);

  const rows = categories.map((cat, i) => {
    const row: Record<string, string | number> = { category: cat };
    for (const s of series) row[s.key] = s.data[i] ?? 0;
    return row;
  });

  let chart;
  if (kind === "pie") {
    const first = series[0];
    const pieData = categories.map((c, i) => ({
      name: c,
      value: first ? (first.data[i] ?? 0) : 0,
    }));
    chart = (
      <PieChart width={width} height={height}>
        <Pie
          data={pieData}
          dataKey="value"
          nameKey="name"
          outerRadius={Math.min(width, height) / 3}
        >
          {pieData.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    );
  } else if (kind === "line") {
    chart = (
      <LineChart width={width} height={height} data={rows}>
        <CartesianGrid stroke="var(--c-line)" />
        <XAxis dataKey="category" />
        <YAxis />
        <Tooltip />
        <Legend />
        {series.map((s, i) => (
          <Line key={s.key} dataKey={s.key} name={s.label} stroke={colors[i % colors.length]} />
        ))}
      </LineChart>
    );
  } else if (kind === "area") {
    chart = (
      <AreaChart width={width} height={height} data={rows}>
        <CartesianGrid stroke="var(--c-line)" />
        <XAxis dataKey="category" />
        <YAxis />
        <Tooltip />
        <Legend />
        {series.map((s, i) => (
          <Area
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stroke={colors[i % colors.length]}
            fill={colors[i % colors.length]}
          />
        ))}
      </AreaChart>
    );
  } else {
    chart = (
      <BarChart width={width} height={height} data={rows}>
        <CartesianGrid stroke="var(--c-line)" />
        <XAxis dataKey="category" />
        <YAxis />
        <Tooltip />
        <Legend />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={colors[i % colors.length]} />
        ))}
      </BarChart>
    );
  }

  return (
    <div data-component={`chart-${kind}`} style={{ fontFamily: "var(--f-body)" }}>
      {chart}
    </div>
  );
}
