"use client";

import { useState } from "react";

/** Client-side "Download PDF" for the public share viewer. Streams the tokenised
 *  public PDF route and triggers a browser download — no session required. */
export function ShareDownloadButton({ token, title }: { token: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const download = async () => {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(token)}/pdf`);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "proposal"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        className="btn btn--primary"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? "Preparing…" : "Download PDF"}
      </button>
      {error ? (
        <span role="alert" style={{ color: "#b00020", fontSize: 13 }}>
          Couldn’t generate the PDF.
        </span>
      ) : null}
    </span>
  );
}
