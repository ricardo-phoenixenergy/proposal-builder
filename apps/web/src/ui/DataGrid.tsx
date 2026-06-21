"use client";

import type { ClipboardEvent } from "react";
import { normalizeTsv, type Dataset } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";

function getDataset(data: Record<string, unknown>): Dataset | undefined {
  const ds = data["dataset"];
  if (typeof ds !== "object" || ds === null) return undefined;
  const v = ds as Record<string, unknown>;
  if (Array.isArray(v["columns"]) && Array.isArray(v["rows"])) return ds as Dataset;
  return undefined;
}

/**
 * Paste-aware editable grid (§6.1). Pasting TSV from Excel/Sheets replaces the
 * dataset; cells are editable and rows can be added/removed. All edits flow
 * through setSectionData, so the same dataset drives the table and every chart.
 */
export function DataGrid({ sectionId }: { sectionId: string }) {
  const section = useProposalStore((s) => s.document.sections.find((x) => x.id === sectionId));
  const setSectionData = useProposalStore((s) => s.setSectionData);
  if (!section) return null;

  const ds = getDataset(section.data);

  const writeDataset = (next: Dataset) =>
    setSectionData(sectionId, { ...section.data, dataset: next });

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData?.getData("text") ?? "";
    if (!text.trim()) return;
    e.preventDefault();
    writeDataset(normalizeTsv(text));
  };

  const setCell = (rowIndex: number, key: string, raw: string) => {
    if (!ds) return;
    const col = ds.columns.find((c) => c.key === key);
    const value = col?.type === "number" ? Number(raw) : raw;
    const rows = ds.rows.map((r, i) => (i === rowIndex ? { ...r, [key]: value } : r));
    writeDataset({ ...ds, rows });
  };

  const addRow = () => {
    if (!ds) return;
    const blank: Record<string, string | number> = {};
    for (const col of ds.columns) blank[col.key] = col.type === "number" ? 0 : "";
    writeDataset({ ...ds, rows: [...ds.rows, blank] });
  };

  const removeRow = (rowIndex: number) => {
    if (!ds) return;
    writeDataset({ ...ds, rows: ds.rows.filter((_, i) => i !== rowIndex) });
  };

  return (
    <div
      data-testid="data-grid"
      className="grid"
      onPaste={onPaste}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {!ds || ds.columns.length === 0 ? (
        <p className="meter">Paste from Excel / Sheets here to populate the table.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                {ds.columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {ds.rows.map((row, i) => (
                <tr key={i}>
                  {ds.columns.map((col) => (
                    <td key={col.key}>
                      <input
                        aria-label={`cell-${i}-${col.key}`}
                        value={String(row[col.key] ?? "")}
                        onChange={(e) => setCell(i, col.key, e.target.value)}
                      />
                    </td>
                  ))}
                  <td>
                    <button type="button" className="btn btn--ghost" aria-label={`remove-row-${i}`} onClick={() => removeRow(i)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="field--row">
            <button type="button" className="btn" onClick={addRow}>
              Add row
            </button>
            <span className="meter">
              {ds.rows.length} rows · {ds.columns.length} cols
            </span>
          </div>
        </>
      )}
    </div>
  );
}
