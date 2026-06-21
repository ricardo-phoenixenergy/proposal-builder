import { getSectionType, type Section } from "@proposal/shared";
import type { RegisteredVariant, ResolvedSection, SectionComponentProps } from "./registry.types";
import { GenericSection } from "../components/fallback/GenericSection";
import { ExecutiveSummary } from "../components/sections/ExecutiveSummary";
import { ExecutiveSummaryBanner } from "../components/sections/ExecutiveSummaryBanner";
import { TextSection } from "../components/sections/TextSection";
import { ComparisonMatrix } from "../components/sections/ComparisonMatrix";
import { DataTable } from "../components/sections/DataTable";
import { ChartView, type ChartKind } from "../components/charts/ChartView";

export type ComponentRegistry = Map<string, RegisteredVariant>;

const key = (type: string, variant: string) => `${type}:${variant}`;

export function createRegistry(): ComponentRegistry {
  return new Map();
}

export function registerVariant(
  registry: ComponentRegistry,
  type: string,
  variant: string,
  entry: RegisteredVariant,
): void {
  registry.set(key(type, variant), entry);
}

/** The application registry: developer-authored, registered layouts (§5.3). */
export const defaultRegistry: ComponentRegistry = createRegistry();
registerVariant(defaultRegistry, "text", "standard", { component: TextSection, schemaVersion: 1 });
registerVariant(defaultRegistry, "executive_summary", "standard", {
  component: ExecutiveSummary,
  schemaVersion: 1,
});
registerVariant(defaultRegistry, "executive_summary", "banner", {
  component: ExecutiveSummaryBanner,
  schemaVersion: 1,
});
registerVariant(defaultRegistry, "commercial_comparison", "table", {
  component: ComparisonMatrix,
  schemaVersion: 1,
});

// data_table: one dataset rendered as a table or any chart type (§6.2).
registerVariant(defaultRegistry, "data_table", "table", { component: DataTable, schemaVersion: 1 });
for (const kind of ["bar", "line", "pie", "area"] as ChartKind[]) {
  const Chart = (props: SectionComponentProps) => <ChartView {...props} kind={kind} />;
  Chart.displayName = `ChartView(${kind})`;
  registerVariant(defaultRegistry, "data_table", kind, { component: Chart, schemaVersion: 1 });
}

/**
 * Resolve a section to a component (§4.4): registry lookup on (type, chosen
 * variant), else the generic fallback. A schemaVersion drift between the
 * registered layout and the current type warns rather than breaks (§5.4).
 */
export function resolveSection(
  section: Section,
  registry: ComponentRegistry = defaultRegistry,
): ResolvedSection {
  const typeSchema = getSectionType(section.type);
  const variant = section.variant ?? typeSchema?.defaultVariant;
  const entry = variant ? registry.get(key(section.type, variant)) : undefined;

  if (entry && variant) {
    if (typeSchema && entry.schemaVersion !== typeSchema.schemaVersion) {
      console.warn(
        `[registry] ${section.type}:${variant} was authored against schemaVersion ` +
          `${entry.schemaVersion} but the type is now at ${typeSchema.schemaVersion}.`,
      );
    }
    return { Component: entry.component, unstyled: false, variant };
  }

  return { Component: GenericSection, unstyled: true };
}
