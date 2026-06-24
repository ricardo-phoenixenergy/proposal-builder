import type { SectionComponentProps } from "../../registry/registry.types";

/**
 * Designed "standard" variant for the executive_summary type. Colour and type
 * come only from theme tokens (§4.3). Reads fields defensively (§5.4).
 */
export function ExecutiveSummary({ data }: SectionComponentProps) {
  const heading = typeof data["heading"] === "string" ? data["heading"] : "";
  const body = typeof data["body"] === "string" ? data["body"] : "";
  return (
    <section data-component="executive-summary">
      <h2 style={{ color: "var(--c-primary)", fontFamily: "var(--f-heading)" }}>{heading}</h2>
      <p style={{ color: "var(--c-text)", fontFamily: "var(--f-body)" }}>{body}</p>
    </section>
  );
}
