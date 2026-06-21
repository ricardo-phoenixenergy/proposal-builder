import type { ProposalDocument, ThemeTokens } from "@proposal/shared";
import { ThemeProvider } from "../theme/ThemeProvider";
import { SectionRenderer } from "./SectionRenderer";
import "./paged.css";

/**
 * Renders a whole proposal as an A4 sheet. Each section is break-safe; sections
 * flagged pageBreakBefore start a new page. The same paged CSS drives the PDF, so
 * the export paginates exactly via Chromium (§10.3).
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
        className="paged-document"
        style={{
          color: "var(--c-text)",
          fontFamily: "var(--f-body)",
          padding: "calc(56px * var(--space))",
          display: "flex",
          flexDirection: "column",
          gap: "calc(32px * var(--space))",
        }}
      >
        {document.sections.map((section) => (
          <div
            key={section.id}
            className="paged-section"
            data-page-break-before={section.pageBreakBefore ? "true" : undefined}
          >
            <SectionRenderer section={section} theme={theme} />
          </div>
        ))}
      </article>
    </ThemeProvider>
  );
}
