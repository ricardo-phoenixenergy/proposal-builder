"use client";

import {
  addMetric,
  addOption,
  getSectionType,
  removeMetric,
  removeOption,
  type ComparisonMatrix,
} from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";

function getMatrix(data: Record<string, unknown>): ComparisonMatrix | undefined {
  const m = data["matrix"];
  if (typeof m !== "object" || m === null) return undefined;
  const v = m as Record<string, unknown>;
  if (Array.isArray(v["metrics"]) && Array.isArray(v["options"])) return m as ComparisonMatrix;
  return undefined;
}

/**
 * Structured editor for the options × metrics matrix (§6.6): add/remove columns
 * (options) and rows (metrics). The option-count ceiling from the section type's
 * `maxColumns` is shown as a live meter and gates the add button.
 */
export function MatrixEditor({ sectionId }: { sectionId: string }) {
  const section = useProposalStore((s) => s.document.sections.find((x) => x.id === sectionId));
  const setSectionData = useProposalStore((s) => s.setSectionData);
  if (!section) return null;

  const matrix = getMatrix(section.data) ?? { metrics: [], options: [] };
  const matrixField = getSectionType(section.type)?.fields.find((f) => f.type === "matrix");
  const maxOptions = matrixField?.maxColumns ?? Infinity;
  const maxMetrics = matrixField?.maxRows ?? Infinity;

  const update = (next: ComparisonMatrix) =>
    setSectionData(sectionId, { ...section.data, matrix: next });

  return (
    <>
      <div className="field">
        <div className="field--row">
          <span className="field__label">Options (columns)</span>
          <span className="meter">
            {matrix.options.length}/{Number.isFinite(maxOptions) ? maxOptions : "∞"}
          </span>
        </div>
        <ul className="chip-list">
          {matrix.options.map((opt, i) => (
            <li key={i}>
              <span>{opt.name}</span>
              <button
                type="button"
                className="btn btn--ghost"
                aria-label={`remove-option-${i}`}
                onClick={() => update(removeOption(matrix, i))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn"
          disabled={matrix.options.length >= maxOptions}
          onClick={() => update(addOption(matrix, `Option ${matrix.options.length + 1}`))}
        >
          Add option
        </button>
      </div>

      <div className="field">
        <div className="field--row">
          <span className="field__label">Metrics (rows)</span>
          <span className="meter">
            {matrix.metrics.length}/{Number.isFinite(maxMetrics) ? maxMetrics : "∞"}
          </span>
        </div>
        <ul className="chip-list">
          {matrix.metrics.map((metric) => (
            <li key={metric}>
              <span>{metric}</span>
              <button
                type="button"
                className="btn btn--ghost"
                aria-label={`remove-metric-${metric}`}
                onClick={() => update(removeMetric(matrix, metric))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn"
          disabled={matrix.metrics.length >= maxMetrics}
          onClick={() => update(addMetric(matrix, `Metric ${matrix.metrics.length + 1}`))}
        >
          Add metric
        </button>
      </div>
    </>
  );
}
