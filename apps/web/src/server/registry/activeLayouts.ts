import { setActiveLayouts, type SectionLayout } from "@proposal/shared";
import { getRepo } from "../repo";

/**
 * Server merged-layouts registry (§C) — mirrors activeRegistry.ts for section
 * types. Loads authored layout rows from the DB and pushes them into the shared
 * `setActiveLayouts` so the server (the /print RSC) resolves authored layouts.
 * Cached per process; mutations call invalidateActiveLayouts().
 */
let cache: SectionLayout[] | null = null;

export async function refreshActiveLayouts(): Promise<SectionLayout[]> {
  const layouts = await getRepo().listSectionLayouts();
  setActiveLayouts(layouts);
  cache = layouts;
  return layouts;
}

export function invalidateActiveLayouts(): void {
  cache = null;
}

export async function getMergedLayouts(): Promise<SectionLayout[]> {
  if (cache) return cache;
  return refreshActiveLayouts();
}
