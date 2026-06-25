import type { Dataset } from "@proposal/shared";
import type { SectionComponentProps } from "../../registry/registry.types";

function isDataset(value: unknown): value is Dataset {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v["columns"]) &&
    Array.isArray(v["rows"]) &&
    v["columns"].every(
      (c) =>
        typeof c === "object" && c !== null && typeof (c as { key?: unknown }).key === "string",
    )
  );
}

function DatasetTable({ dataset }: { dataset: Dataset }) {
  return (
    <table style={{ borderColor: "var(--c-line)" }}>
      <thead>
        <tr>
          {dataset.columns.map((col) => (
            <th key={col.key} style={{ fontFamily: "var(--f-heading)" }}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {dataset.rows.map((row, i) => (
          <tr key={i}>
            {dataset.columns.map((col) => (
              <td key={col.key}>{String(row[col.key] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Generic, schema-agnostic fallback (§5.4): walks the section's data and renders
 * strings as text, datasets as a plain table, anything else as raw JSON. Styled
 * only with theme tokens — no bespoke art direction — so a type with fields but
 * no designed component still renders something on the page. Reads defensively
 * to degrade rather than crash.
 */
export function GenericSection({
  data,
  imageFields,
}: SectionComponentProps & { imageFields?: ReadonlySet<string> }) {
  return (
    <div data-fallback="true" style={{ color: "var(--c-text)", fontFamily: "var(--f-body)" }}>
      {Object.entries(data).map(([key, value]) => (
        <div key={key} data-field={key}>
          {imageFields?.has(key) && typeof value === "string" && value !== "" ? (
            // An image field renders as an actual image, not its URL string.
            <img src={value} alt="" style={{ maxWidth: "100%", display: "block" }} />
          ) : typeof value === "string" ? (
            <p>{value}</p>
          ) : isDataset(value) ? (
            <DatasetTable dataset={value} />
          ) : (
            <pre>{JSON.stringify(value, null, 2)}</pre>
          )}
        </div>
      ))}
    </div>
  );
}
