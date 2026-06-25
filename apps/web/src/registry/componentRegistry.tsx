import { getSectionType, getLayout, listLayoutVariants, type Section } from "@proposal/shared";
import type { RegisteredVariant, ResolvedSection, SectionComponentProps } from "./registry.types";
import { GenericSection } from "../components/fallback/GenericSection";
import { LayoutRenderer } from "../render/LayoutRenderer";
import { ExecutiveSummary } from "../components/sections/ExecutiveSummary";
import { ExecutiveSummaryBanner } from "../components/sections/ExecutiveSummaryBanner";
import { TextSection } from "../components/sections/TextSection";
import { ComparisonMatrix } from "../components/sections/ComparisonMatrix";
import { DataTable } from "../components/sections/DataTable";
import { ChartView } from "../components/charts/ChartView";
import { CHART_VARIANTS } from "../print/clientPaint";

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
for (const kind of CHART_VARIANTS) {
  const Chart = (props: SectionComponentProps) => <ChartView {...props} kind={kind} />;
  Chart.displayName = `ChartView(${kind})`;
  registerVariant(defaultRegistry, "data_table", kind, { component: Chart, schemaVersion: 1 });
}

/**
 * Resolve a section to a component (§C/§J). Precedence: an authored layout for
 * (type, variant, pageFormat) → the registered code component → the generic
 * fallback. An authored layout renders via the safe `LayoutRenderer`.
 */
export function resolveSection(
  section: Section,
  registry: ComponentRegistry = defaultRegistry,
  pageFormat?: string,
): ResolvedSection {
  const typeSchema = getSectionType(section.type);
  // Precedence for the variant: the section's explicit choice → the type's declared
  // default → the first authored layout for this format. The last step makes a
  // freshly-authored layout render without the author having to also pick a variant
  // or set a defaultVariant on the type (otherwise the section stays unstyled).
  const variant =
    section.variant ??
    typeSchema?.defaultVariant ??
    listLayoutVariants(section.type, pageFormat)[0];

  // 1. Authored layout wins (format-aware).
  if (variant) {
    const layout = getLayout(section.type, variant, pageFormat);
    if (layout) {
      const Layout = (props: SectionComponentProps) => (
        <LayoutRenderer
          layout={layout}
          data={props.data}
          theme={props.theme}
          {...(pageFormat !== undefined ? { pageFormat } : {})}
        />
      );
      Layout.displayName = `Layout(${section.type}:${variant})`;
      return { Component: Layout, unstyled: false, variant };
    }
  }

  // 2. Code component.
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

  // 3. Generic fallback. When the type has image fields, wrap the fallback so it
  //    renders uploaded images as actual <img> rather than their URL strings.
  const imageFields = (typeSchema?.fields ?? []).filter((f) => f.type === "image");
  if (imageFields.length > 0) {
    const keys = new Set(imageFields.map((f) => f.key));
    const Fallback = (props: SectionComponentProps) => (
      <GenericSection {...props} imageFields={keys} />
    );
    Fallback.displayName = "GenericSection";
    return { Component: Fallback, unstyled: true };
  }
  return { Component: GenericSection, unstyled: true };
}

/** Selectable variants for a type at a format: code variants ∪ authored variants (§C). */
export function availableVariants(
  type: string,
  pageFormat?: string,
  registry: ComponentRegistry = defaultRegistry,
): string[] {
  const prefix = `${type}:`;
  const code = [...registry.keys()]
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
  const authored = listLayoutVariants(type, pageFormat);
  return [...new Set([...code, ...authored])];
}
