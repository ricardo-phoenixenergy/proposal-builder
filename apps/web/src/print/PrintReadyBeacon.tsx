"use client";

import { useEffect, useState } from "react";

/**
 * Flips `data-print-ready` once the page has painted, for documents whose content
 * (Recharts charts) only renders client-side. Two animation frames give the chart
 * islands a chance to paint before headless Chromium captures the PDF. Text-only
 * documents skip this entirely and set readiness server-side instead (M-9).
 */
export function PrintReadyBeacon() {
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

  return ready ? <div data-print-ready="true" hidden /> : null;
}
