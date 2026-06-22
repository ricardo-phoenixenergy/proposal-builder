import { getSectionType } from "../registry/sectionTypes";

/**
 * The empty/blank `data` for a section type — used to scaffold blanks (§7.2) and
 * to reset a section when a choice slot toggles to a different type (§7.3).
 */
export function emptyDataForType(type: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of getSectionType(type)?.fields ?? []) {
    switch (field.type) {
      case "text":
      case "paragraph":
        data[field.key] = "";
        break;
      case "list":
        data[field.key] = [];
        break;
      case "image":
        data[field.key] = "";
        break;
      case "dataset":
        data[field.key] = { columns: [], rows: [] };
        break;
      case "matrix":
        data[field.key] = { metrics: [], options: [] };
        break;
    }
  }
  return data;
}
