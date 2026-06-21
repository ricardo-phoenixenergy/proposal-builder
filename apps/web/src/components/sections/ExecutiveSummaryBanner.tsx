import type { SectionComponentProps } from "../../registry/registry.types";

/**
 * Alternative "banner" layout for executive_summary — same data, different
 * design (heading reversed out of a primary-coloured band). Demonstrates that
 * switching a variant changes only presentation, never content (§5.3).
 */
export function ExecutiveSummaryBanner({ data }: SectionComponentProps) {
  const heading = typeof data["heading"] === "string" ? data["heading"] : "";
  const body = typeof data["body"] === "string" ? data["body"] : "";
  return (
    <section data-component="executive-summary-banner">
      <div
        style={{
          background: "var(--c-primary)",
          color: "var(--c-surface)",
          fontFamily: "var(--f-heading)",
          padding: "calc(16px * var(--space))",
          borderRadius: "var(--radius)",
        }}
      >
        {heading}
      </div>
      <p style={{ color: "var(--c-text)", fontFamily: "var(--f-body)" }}>{body}</p>
    </section>
  );
}
