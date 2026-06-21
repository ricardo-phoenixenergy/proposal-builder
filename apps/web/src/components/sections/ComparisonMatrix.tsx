import type { CSSProperties } from "react";
import type { ComparisonMatrix as ComparisonMatrixData } from "@proposal/shared";
import type { SectionComponentProps } from "../../registry/registry.types";

const NOT_APPLICABLE = "—";

function isMatrix(value: unknown): value is ComparisonMatrixData {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v["metrics"]) && Array.isArray(v["options"]);
}

/**
 * Designed "table" variant for commercial_comparison (§6.6). Maps both axes so
 * it is dynamic in N: a third option slots in as a new column with no code
 * change. Not-applicable cells get an explicit muted dash.
 */
export function ComparisonMatrix({ data }: SectionComponentProps) {
  const matrix = data["matrix"];
  if (!isMatrix(matrix)) return <div data-empty="true" />;

  const headCell: CSSProperties = {
    color: "var(--c-primary)",
    fontFamily: "var(--f-heading)",
    fontWeight: 600,
    textAlign: "right",
    padding: "10px 16px",
    borderBottom: "2px solid var(--c-line)",
  };
  const rowHead: CSSProperties = {
    fontFamily: "var(--f-heading)",
    fontWeight: 600,
    textAlign: "left",
    padding: "10px 16px 10px 0",
    borderBottom: "1px solid var(--c-line)",
    whiteSpace: "nowrap",
  };

  return (
    <table
      data-component="comparison-matrix"
      style={{
        color: "var(--c-text)",
        fontFamily: "var(--f-body)",
        borderCollapse: "collapse",
        width: "100%",
      }}
    >
      <thead>
        <tr>
          <th />
          {matrix.options.map((option) => (
            <th key={option.name} style={headCell}>
              {option.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {matrix.metrics.map((metric) => (
          <tr key={metric}>
            <th scope="row" style={rowHead}>
              {metric}
            </th>
            {matrix.options.map((option) => {
              const value = option.values[metric] ?? NOT_APPLICABLE;
              const na = value === NOT_APPLICABLE;
              return (
                <td
                  key={option.name}
                  data-na={na ? "true" : undefined}
                  style={{
                    color: na ? "var(--c-muted)" : "var(--c-text)",
                    textAlign: "right",
                    padding: "10px 16px",
                    borderBottom: "1px solid var(--c-line)",
                  }}
                >
                  {value}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
