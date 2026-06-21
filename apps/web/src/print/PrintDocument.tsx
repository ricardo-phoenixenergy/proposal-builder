"use client";

import { useEffect, useState } from "react";
import type { ProposalDocument, ThemeTokens } from "@proposal/shared";
import { DocumentRenderer } from "../render/DocumentRenderer";

/**
 * The print surface: the same themed React components as the editor (§6.7, §10.3),
 * rendered standalone. Sets `data-print-ready` after mount + two animation frames
 * so charts/SVG have painted before headless Chromium captures the PDF.
 */
export function PrintDocument({
  document,
  theme,
}: {
  document: ProposalDocument;
  theme: ThemeTokens;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  return (
    <div data-print-root data-print-ready={ready ? "true" : undefined}>
      <DocumentRenderer document={document} theme={theme} />
    </div>
  );
}
