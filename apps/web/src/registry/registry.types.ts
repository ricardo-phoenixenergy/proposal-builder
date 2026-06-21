import type { ThemeTokens } from "@proposal/shared";
import type { ComponentType } from "react";

/**
 * Section components are pure: (data, theme) → JSX, no data fetching inside
 * (CLAUDE.md conventions). Colour/type/spacing come from CSS variables set by
 * the ThemeProvider, never from these props directly.
 */
export interface SectionComponentProps {
  data: Record<string, unknown>;
  theme: ThemeTokens;
}

export type SectionComponent = ComponentType<SectionComponentProps>;

export interface RegisteredVariant {
  component: SectionComponent;
  /** schemaVersion this layout was authored against — for drift checks (§5.4). */
  schemaVersion: number;
}

export interface ResolvedSection {
  Component: SectionComponent;
  /** True when resolution fell through to the generic fallback (§5.4). */
  unstyled: boolean;
  /** The variant key actually used (undefined when falling back). */
  variant?: string;
}
