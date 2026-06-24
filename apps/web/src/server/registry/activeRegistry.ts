// apps/web/src/server/registry/activeRegistry.ts
import {
  builtInSectionTypes,
  setActiveSectionTypes,
  type SectionTypeSchema,
} from "@proposal/shared";
import { getRepo } from "../repo";
import type { SectionTypeRow } from "../repo/types";

let cache: SectionTypeSchema[] | null = null;

/** Merge built-ins with DB rows: full definitions override by key; null rows overlay deprecation. */
function merge(rows: SectionTypeRow[]): SectionTypeSchema[] {
  const map = new Map<string, SectionTypeSchema>();
  for (const t of builtInSectionTypes) map.set(t.type, t);
  for (const row of rows) {
    const base = row.definition ?? map.get(row.type);
    if (!base) continue; // null overlay for an unknown key — ignore
    map.set(row.type, { ...base, deprecated: row.deprecated });
  }
  return [...map.values()];
}

/** Reload from the repo, push the merged set into the shared registry, cache + return. */
export async function refreshActiveRegistry(): Promise<SectionTypeSchema[]> {
  const rows = await getRepo().listSectionTypeRows();
  const merged = merge(rows);
  // Pass the full merged set — setActiveSectionTypes re-adds built-ins underneath,
  // so duplicates are harmless and the authored overrides/deprecations take effect.
  setActiveSectionTypes(merged);
  cache = merged;
  return merged;
}

export function invalidateActiveRegistry(): void {
  cache = null;
}

/** Cached merged list; hydrates on first call or after invalidation. */
export async function getMergedSectionTypes(): Promise<SectionTypeSchema[]> {
  if (cache) return cache;
  return refreshActiveRegistry();
}
