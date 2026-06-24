import type { ProposalDocument, ThemeTokens } from "@proposal/shared";
import { DocumentRenderer } from "../render/DocumentRenderer";
import { documentNeedsClientPaint } from "./clientPaint";
import { PrintReadyBeacon } from "./PrintReadyBeacon";

/**
 * The print surface: the same themed React components as the editor (§6.7, §10.3),
 * rendered standalone as a Server Component. `data-print-ready` — the flag headless
 * Chromium waits on — is set server-side for documents whose content paints
 * server-side, so the common (text/table) case skips the hydration + double-rAF
 * round-trip entirely. Documents with client-only content (Recharts charts) defer
 * readiness to <PrintReadyBeacon/>, which flips the flag after the frames paint (M-9).
 */
export function PrintDocument({
  document,
  theme,
}: {
  document: ProposalDocument;
  theme: ThemeTokens;
}) {
  const needsClientPaint = documentNeedsClientPaint(document);
  return (
    <div data-print-root {...(needsClientPaint ? {} : { "data-print-ready": "true" })}>
      <DocumentRenderer document={document} theme={theme} />
      {needsClientPaint ? <PrintReadyBeacon /> : null}
    </div>
  );
}
