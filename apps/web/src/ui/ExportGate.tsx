"use client";

import { useState } from "react";
import { openTemplate, validateForExport, type ValidationResult } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";

/**
 * The hard export gate (§9). Validates the document against schema + the active
 * template's locks; if it passes and the proposal is saved, downloads the PDF
 * rendered by the /export endpoint (headless Chromium, §10.3).
 */
export function ExportGate() {
  const document = useProposalStore((s) => s.document);
  const proposalId = useProposalStore((s) => s.proposalId);
  const templates = useProposalStore((s) => s.templates);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [busy, setBusy] = useState(false);

  const onExport = () => {
    const template = templates.find((t) => t.id === document.templateId) ?? openTemplate;
    setResult(validateForExport(document, template));
  };

  const onDownload = async () => {
    if (!proposalId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/export`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          errors?: ValidationResult["errors"];
        };
        setResult({
          valid: false,
          errors: body.errors ?? [
            { path: "", message: body.error ?? "Export failed", source: "app" },
          ],
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `proposal-${proposalId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button type="button" className="btn btn--primary" onClick={onExport}>
        Export PDF
      </button>
      {result ? (
        <div role="dialog" aria-label="Export check" className="export-popover">
          {result.valid ? (
            <>
              <p style={{ margin: 0 }}>✓ Ready to export.</p>
              {proposalId ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ marginTop: 8 }}
                  disabled={busy}
                  onClick={() => void onDownload()}
                >
                  {busy ? "Rendering…" : "Download PDF"}
                </button>
              ) : (
                <small className="meter" style={{ display: "block", marginTop: 8 }}>
                  Save to cloud first to render the PDF.
                </small>
              )}
            </>
          ) : (
            <>
              <strong>
                Blocked — {result.errors.length} issue{result.errors.length === 1 ? "" : "s"}:
              </strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {result.errors.map((e, i) => (
                  <li key={i}>
                    <code>{e.path}</code> — {e.message}
                  </li>
                ))}
              </ul>
            </>
          )}
          <button
            type="button"
            className="btn btn--ghost"
            style={{ marginTop: 8 }}
            onClick={() => setResult(null)}
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}
