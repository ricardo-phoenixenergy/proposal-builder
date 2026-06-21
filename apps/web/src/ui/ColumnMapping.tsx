"use client";

import { defaultMapping, type ColumnMapping as Mapping, type Dataset } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";

function getDataset(data: Record<string, unknown>): Dataset | undefined {
  const ds = data["dataset"];
  if (typeof ds !== "object" || ds === null) return undefined;
  const v = ds as Record<string, unknown>;
  if (Array.isArray(v["columns"]) && Array.isArray(v["rows"])) return ds as Dataset;
  return undefined;
}

/**
 * Column-mapping control (§6.3): pick the category column and which numeric
 * columns become chart series. Sensible defaults keep this invisible until the
 * user wants something other than the obvious mapping.
 */
export function ColumnMapping({ sectionId }: { sectionId: string }) {
  const section = useProposalStore((s) => s.document.sections.find((x) => x.id === sectionId));
  const setSectionData = useProposalStore((s) => s.setSectionData);
  if (!section) return null;

  const ds = getDataset(section.data);
  if (!ds || ds.columns.length === 0) return null;

  const mapping = ds.mapping ?? defaultMapping(ds);
  const textCols = ds.columns.filter((c) => c.type === "text");
  const numCols = ds.columns.filter((c) => c.type === "number");

  const update = (next: Mapping) =>
    setSectionData(sectionId, { ...section.data, dataset: { ...ds, mapping: next } });

  const toggleValue = (key: string, on: boolean) => {
    const set = new Set(mapping.valueColumns ?? []);
    if (on) set.add(key);
    else set.delete(key);
    update({ ...mapping, valueColumns: numCols.map((c) => c.key).filter((k) => set.has(k)) });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span>Category column</span>
        <select
          value={mapping.categoryColumn ?? ""}
          onChange={(e) => update({ ...mapping, categoryColumn: e.target.value })}
        >
          {textCols.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset style={{ border: "1px solid var(--c-line)", display: "flex", flexDirection: "column", gap: 4 }}>
        <legend>Value columns (series)</legend>
        {numCols.map((c) => (
          <label key={c.key} style={{ display: "flex", gap: 6 }}>
            <input
              type="checkbox"
              checked={(mapping.valueColumns ?? []).includes(c.key)}
              onChange={(e) => toggleValue(c.key, e.target.checked)}
            />
            {c.label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
