import { getSectionType, type ProposalDocument } from "@proposal/shared";
import type { ChartKind } from "../components/charts/ChartView";

/**
 * The `data_table` variants that render through the Recharts `ChartView`. Recharts
 * computes its geometry in a post-mount effect, so these only paint on the client.
 * Single source of truth — the component registry registers exactly these variants.
 */
export const CHART_VARIANTS: readonly ChartKind[] = ["bar", "line", "pie", "area"];
const chartVariantSet = new Set<string>(CHART_VARIANTS);

/**
 * True when any section can only be painted on the client (today: Recharts charts).
 * The print surface uses this to decide whether `data-print-ready` — the flag
 * headless Chromium waits on — can be set server-side (M-9). Everything else the
 * app renders (text, tables, comparison matrix, images, authored layouts via the
 * safe interpreter) paints server-side, so only chart variants force the slower
 * "wait for the client" path. A new client-painting component must be added here.
 */
export function documentNeedsClientPaint(document: ProposalDocument): boolean {
  return document.sections.some((section) => {
    const variant = section.variant ?? getSectionType(section.type)?.defaultVariant;
    return variant !== undefined && chartVariantSet.has(variant);
  });
}
