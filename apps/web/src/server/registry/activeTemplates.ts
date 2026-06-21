// apps/web/src/server/registry/activeTemplates.ts
import { builtInTemplates, type Template } from "@proposal/shared";
import { getRepo } from "../repo";
import type { TemplateRow } from "../repo/types";

let cache: Template[] | null = null;

/** Merge built-ins with DB rows: full templates override by id; null rows overlay deprecation. */
function merge(rows: TemplateRow[]): Template[] {
  const map = new Map<string, Template>();
  for (const t of builtInTemplates) map.set(t.id, t);
  for (const row of rows) {
    const base = row.template ?? map.get(row.id);
    if (!base) continue; // null overlay for an unknown id — ignore
    map.set(row.id, { ...base, deprecated: row.deprecated });
  }
  return [...map.values()];
}

export async function refreshActiveTemplates(): Promise<Template[]> {
  const rows = await getRepo().listTemplateRows();
  cache = merge(rows);
  return cache;
}

export function invalidateActiveTemplates(): void {
  cache = null;
}

/** Cached merged list; hydrates on first call or after invalidation. */
export async function getMergedTemplates(): Promise<Template[]> {
  if (cache) return cache;
  return refreshActiveTemplates();
}
