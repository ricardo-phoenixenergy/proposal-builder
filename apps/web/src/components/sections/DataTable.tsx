import type { Dataset } from "@proposal/shared";
import type { SectionComponentProps } from "../../registry/registry.types";

function isDataset(value: unknown): value is Dataset {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v["columns"]) && Array.isArray(v["rows"]);
}

/** Designed "table" variant for data_table — a view of the dataset (§6.2). */
export function DataTable({ data }: SectionComponentProps) {
  const ds = data["dataset"];
  if (!isDataset(ds)) return <div data-empty="true" />;

  return (
    <table
      data-component="data-table"
      style={{
        color: "var(--c-text)",
        fontFamily: "var(--f-body)",
        borderCollapse: "collapse",
        width: "100%",
      }}
    >
      <thead>
        <tr>
          {ds.columns.map((col) => (
            <th
              key={col.key}
              style={{
                color: "var(--c-primary)",
                fontFamily: "var(--f-heading)",
                fontWeight: 600,
                textAlign: col.type === "number" ? "right" : "left",
                padding: "10px 14px",
                borderBottom: "2px solid var(--c-line)",
              }}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ds.rows.map((row, i) => (
          <tr key={i}>
            {ds.columns.map((col) => (
              <td
                key={col.key}
                style={{
                  textAlign: col.type === "number" ? "right" : "left",
                  padding: "9px 14px",
                  borderBottom: "1px solid var(--c-line)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {String(row[col.key] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
