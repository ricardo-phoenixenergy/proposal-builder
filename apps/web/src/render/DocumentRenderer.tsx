import type { ProposalDocument, ThemeTokens } from "@proposal/shared";
import { ThemeProvider } from "../theme/ThemeProvider";
import { SectionRenderer } from "./SectionRenderer";

/**
 * Renders a whole proposal: every section in order, inside one theme scope so
 * all sections resolve their tokens from the same CSS variables.
 */
export function DocumentRenderer({
  document,
  theme,
}: {
  document: ProposalDocument;
  theme: ThemeTokens;
}) {
  return (
    <ThemeProvider theme={theme}>
      <article
        data-document={document.id}
        style={{
          background: "var(--c-surface)",
          color: "var(--c-text)",
          fontFamily: "var(--f-body)",
          padding: "calc(56px * var(--space))",
          display: "flex",
          flexDirection: "column",
          gap: "calc(32px * var(--space))",
        }}
      >
        {document.sections.map((section) => (
          <SectionRenderer key={section.id} section={section} theme={theme} />
        ))}
      </article>
    </ThemeProvider>
  );
}
