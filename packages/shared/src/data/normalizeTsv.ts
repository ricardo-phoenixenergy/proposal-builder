import type { Dataset, DatasetColumn } from "../types/data";

function slug(label: string, index: number): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || `col_${index + 1}`;
}

function isNumeric(value: string): boolean {
  if (value.trim() === "") return false;
  return Number.isFinite(Number(value));
}

/**
 * Build the canonical Dataset from a parsed table (first row = headers). Shared
 * by the clipboard (TSV) and file-import (CSV) paths so type detection and key
 * slugging can't diverge. A column is numeric when every non-empty cell parses
 * as a finite number; keys are slugged and de-duplicated.
 */
export function tableToDataset(table: string[][]): Dataset {
  const rowsOnly = table.filter((r) => r.some((c) => c.trim() !== ""));
  if (rowsOnly.length === 0) return { columns: [], rows: [] };

  const headers = rowsOnly[0]!;
  const bodyCells = rowsOnly.slice(1);

  const seen = new Map<string, number>();
  const keys = headers.map((h, i) => {
    let key = slug(h, i);
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count > 0) key = `${key}_${count + 1}`;
    return key;
  });

  const columns: DatasetColumn[] = headers.map((label, i) => {
    const cells = bodyCells.map((r) => r[i] ?? "").filter((c) => c.trim() !== "");
    const numeric = cells.length > 0 && cells.every(isNumeric);
    return { key: keys[i]!, label: label.trim(), type: numeric ? "number" : "text" };
  });

  const rows = bodyCells.map((cells) => {
    const row: Record<string, string | number> = {};
    columns.forEach((col, i) => {
      const raw = cells[i] ?? "";
      row[col.key] = col.type === "number" ? Number(raw) : raw;
    });
    return row;
  });

  return { columns, rows };
}

/**
 * Parse clipboard/TSV text (what Excel and Sheets put on the clipboard) into the
 * canonical Dataset.
 */
export function normalizeTsv(tsv: string): Dataset {
  const table = tsv
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.split("\t"));
  return tableToDataset(table);
}
