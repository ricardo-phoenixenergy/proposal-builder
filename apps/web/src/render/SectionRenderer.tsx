import type { Section, ThemeTokens } from "@proposal/shared";
import {
  resolveSection,
  type ComponentRegistry,
} from "../registry/componentRegistry";

/**
 * Resolves one section to its component and renders it, surfacing the
 * unstyled/fallback state as `data-unstyled` and the chosen layout as
 * `data-variant` for the outline UI (slice 3) to consume.
 */
export function SectionRenderer({
  section,
  theme,
  registry,
  pageFormat,
}: {
  section: Section;
  theme: ThemeTokens;
  registry?: ComponentRegistry;
  pageFormat?: string;
}) {
  const { Component, unstyled, variant } = resolveSection(section, registry, pageFormat);
  return (
    <div
      data-section-type={section.type}
      data-variant={variant}
      data-unstyled={unstyled ? "true" : undefined}
    >
      <Component data={section.data} theme={theme} />
    </div>
  );
}
