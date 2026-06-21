import { describe, expect, it } from "vitest";
import type { ComparisonMatrix, Dataset } from "../types/data";
import { normalizeTsv } from "../data/normalizeTsv";
import { defaultMapping, toChartSeries } from "../data/columnMapping";
import { addOption, removeOption, addMetric, removeMetric } from "../data/matrixOps";

describe("normalizeTsv — clipboard TSV → Dataset", () => {
  it("parses headers into typed columns and rows, detecting numeric columns", () => {
    const ds = normalizeTsv("Item\tPrice\nPanel\t120\nInverter\t300");
    expect(ds.columns).toEqual([
      { key: "item", label: "Item", type: "text" },
      { key: "price", label: "Price", type: "number" },
    ]);
    expect(ds.rows).toEqual([
      { item: "Panel", price: 120 },
      { item: "Inverter", price: 300 },
    ]);
  });

  it("tolerates CRLF and trailing blank lines", () => {
    const ds = normalizeTsv("A\tB\r\n1\t2\r\n\r\n");
    expect(ds.rows).toHaveLength(1);
  });

  it("returns empty columns/rows for empty input", () => {
    expect(normalizeTsv("")).toEqual({ columns: [], rows: [] });
  });

  it("disambiguates duplicate header keys", () => {
    const ds = normalizeTsv("X\tX\na\tb");
    expect(ds.columns.map((c) => c.key)).toEqual(["x", "x_2"]);
  });
});

describe("columnMapping — defaults and chart-series derivation", () => {
  const ds: Dataset = {
    columns: [
      { key: "item", label: "Item", type: "text" },
      { key: "q1", label: "Q1", type: "number" },
      { key: "q2", label: "Q2", type: "number" },
    ],
    rows: [
      { item: "Panel", q1: 10, q2: 20 },
      { item: "Inverter", q1: 5, q2: 8 },
    ],
  };

  it("defaults categories to the first text column and values to the numeric columns", () => {
    expect(defaultMapping(ds)).toEqual({ categoryColumn: "item", valueColumns: ["q1", "q2"] });
  });

  it("derives aligned categories and series", () => {
    const out = toChartSeries(ds, defaultMapping(ds));
    expect(out.categories).toEqual(["Panel", "Inverter"]);
    expect(out.series).toEqual([
      { key: "q1", label: "Q1", data: [10, 5] },
      { key: "q2", label: "Q2", data: [20, 8] },
    ]);
  });
});

describe("matrixOps — add/remove columns (options) and rows (metrics)", () => {
  const base: ComparisonMatrix = {
    metrics: ["Upfront cost", "Payback"],
    options: [{ name: "Capex", values: { "Upfront cost": "£280k", Payback: "6.2 yrs" } }],
  };

  it("addOption appends a column with N/A cells for every metric", () => {
    const next = addOption(base, "PPA");
    expect(next.options).toHaveLength(2);
    expect(next.options[1]).toEqual({ name: "PPA", values: { "Upfront cost": "—", Payback: "—" } });
    expect(base.options).toHaveLength(1); // immutable
  });

  it("addMetric appends a row and fills N/A for every option", () => {
    const next = addMetric(base, "Term");
    expect(next.metrics).toContain("Term");
    expect(next.options[0]!.values["Term"]).toBe("—");
  });

  it("removeOption and removeMetric drop the right axis", () => {
    const two = addOption(base, "PPA");
    expect(removeOption(two, 0).options.map((o) => o.name)).toEqual(["PPA"]);
    expect(removeMetric(base, "Payback").metrics).toEqual(["Upfront cost"]);
    expect(removeMetric(base, "Payback").options[0]!.values).not.toHaveProperty("Payback");
  });
});
