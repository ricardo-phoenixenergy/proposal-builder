import { getSectionType } from "../registry/sectionTypes";
import type { FieldSchema } from "../types/section";

/** A placeholder cover image for the editor preview. */
const SAMPLE_IMAGE = "https://placehold.co/1280x720/0b5d3b/ffffff?text=Cover+image";

function sampleField(field: FieldSchema): unknown {
  switch (field.type) {
    case "text":
      return `Sample ${field.label ?? field.key}`;
    case "paragraph":
      return "Sample paragraph copy that shows how this block flows across a couple of lines in the live preview.";
    case "list":
      return ["First sample point", "Second sample point", "Third sample point"];
    case "dataset":
      return {
        columns: [
          { key: "label", label: "Label", type: "text" },
          { key: "value", label: "Value", type: "number" },
        ],
        rows: [
          { label: "2024", value: 42 },
          { label: "2025", value: 58 },
          { label: "2026", value: 71 },
        ],
      };
    case "matrix":
      return {
        metrics: ["Cost", "Speed", "Support"],
        options: [
          { name: "Option A", values: { Cost: "$$", Speed: "Fast", Support: "24/7" } },
          { name: "Option B", values: { Cost: "$", Speed: "Medium", Support: "Business hours" } },
        ],
      };
    case "image":
      return SAMPLE_IMAGE;
    default:
      return "";
  }
}

/**
 * Deterministic placeholder `data` for a section type, used to render the editor's
 * live preview (§E). Returns {} for an unknown type.
 */
export function sampleDataForType(type: string): Record<string, unknown> {
  const schema = getSectionType(type);
  if (!schema) return {};
  const data: Record<string, unknown> = {};
  for (const field of schema.fields) data[field.key] = sampleField(field);
  return data;
}
