import type { SectionLayout } from "../types/layout";
import { DEFAULT_PAGE_FORMAT } from "../render/page";

/**
 * Active-layouts registry (§C) — mirrors the section-type registry. Holds the
 * authored layouts pushed in from the DB (Phase 4) or seeded in tests. Identity is
 * (type, variant, pageFormat); an absent format resolves to the default.
 */
const activeLayouts = new Map<string, SectionLayout>();
let revision = 0;

const lkey = (type: string, variant: string, pageFormat: string) =>
  `${type}:${variant}:${pageFormat}`;

export function setActiveLayouts(list: SectionLayout[]): void {
  activeLayouts.clear();
  for (const l of list) activeLayouts.set(lkey(l.type, l.variant, l.pageFormat), l);
  revision++;
}

export function getLayout(
  type: string,
  variant: string,
  pageFormat?: string,
): SectionLayout | undefined {
  return activeLayouts.get(lkey(type, variant, pageFormat ?? DEFAULT_PAGE_FORMAT));
}

/** Authored variant slugs for a type that have a layout for the given format. */
export function listLayoutVariants(type: string, pageFormat?: string): string[] {
  const fmt = pageFormat ?? DEFAULT_PAGE_FORMAT;
  return [...activeLayouts.values()]
    .filter((l) => l.type === type && l.pageFormat === fmt)
    .map((l) => l.variant);
}

export function layoutsRevision(): number {
  return revision;
}

/** Test seam: clear the registry. */
export function resetLayoutsForTests(): void {
  activeLayouts.clear();
  revision++;
}
