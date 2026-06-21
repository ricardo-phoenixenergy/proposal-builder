import type { ProposalDocument, ThemeTokens } from "@proposal/shared";
import { getPageFormat } from "@proposal/shared";
import { ThemeProvider } from "../theme/ThemeProvider";
import { SectionRenderer } from "./SectionRenderer";
import "./paged.css";

/**
 * Renders a proposal at its chosen page format (§J). Report mode flows sections
 * (break-safe, honouring manual page breaks); Slides mode renders one section per
 * page at the format's exact dimensions. The same paged CSS + format size drive
 * the editor preview and the PDF.
 */
export function DocumentRenderer({
  document,
  theme,
}: {
  document: ProposalDocument;
  theme: ThemeTokens;
}) {
  const fmt = getPageFormat(document.pageFormat);
  const slides = document.pageMode === "slides";
  return (
    <ThemeProvider theme={theme}>
      <article
        data-document={document.id}
        data-page-mode={slides ? "slides" : "report"}
        className="paged-document"
        style={{
          width: `${fmt.widthMm}mm`,
          color: "var(--c-text)",
          fontFamily: "var(--f-body)",
          padding: slides ? 0 : "calc(56px * var(--space))",
          display: "flex",
          flexDirection: "column",
          gap: slides ? 0 : "calc(32px * var(--space))",
        }}
      >
        {document.sections.map((section) =>
          slides ? (
            <div key={section.id} className="paged-slide" style={{ height: `${fmt.heightMm}mm` }}>
              <SectionRenderer section={section} theme={theme} />
            </div>
          ) : (
            <div
              key={section.id}
              className="paged-section"
              data-page-break-before={section.pageBreakBefore ? "true" : undefined}
            >
              <SectionRenderer section={section} theme={theme} />
            </div>
          ),
        )}
      </article>
    </ThemeProvider>
  );
}
