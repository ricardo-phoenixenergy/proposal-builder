import type { SectionComponentProps } from "../../registry/registry.types";

/**
 * Designed "standard" variant for the generic text/cover block. Heading reads as
 * a document title; body as lede copy. Token-driven (§4.3), defensive reads (§5.4).
 */
export function TextSection({ data }: SectionComponentProps) {
  const heading = typeof data["heading"] === "string" ? data["heading"] : "";
  const body = typeof data["body"] === "string" ? data["body"] : "";

  return (
    <section data-component="text-section">
      {heading ? (
        <h1
          style={{
            color: "var(--c-primary)",
            fontFamily: "var(--f-heading)",
            fontSize: "calc(2rem * var(--space))",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          {heading}
        </h1>
      ) : null}
      {body ? (
        <p
          style={{
            color: "var(--c-text)",
            fontFamily: "var(--f-body)",
            fontSize: "1.05rem",
            lineHeight: 1.6,
            margin: "0.75em 0 0",
          }}
        >
          {body}
        </p>
      ) : null}
    </section>
  );
}
