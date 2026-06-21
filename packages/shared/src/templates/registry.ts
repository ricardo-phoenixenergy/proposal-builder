import type { Template } from "../types/template";
import { openTemplate, prelimTemplate } from "./sampleTemplates";

/** In-code template registry (persisted to the DB in slice 8). */
export const templates: Template[] = [openTemplate, prelimTemplate];

const templateMap = new Map(templates.map((t) => [t.id, t]));

export function getTemplate(id: string): Template | undefined {
  return templateMap.get(id);
}
