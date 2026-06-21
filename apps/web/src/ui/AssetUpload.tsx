"use client";

import { useState } from "react";
import { useProposalStore } from "../state/proposalStore";

/**
 * Logo upload (§13.10). Posts an image to /api/assets (Vercel Blob) and stores
 * the returned public URL in the theme's logoUrl token — content stays free of
 * raw bytes; the presentation layer reads the URL.
 */
export function AssetUpload() {
  const theme = useProposalStore((s) => s.theme);
  const setTheme = useProposalStore((s) => s.setTheme);
  const notify = useProposalStore((s) => s.notify);
  const [busy, setBusy] = useState(false);

  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/assets", { method: "POST", body });
      if (!res.ok) {
        notify("error", res.status === 415 ? "That file isn't an image." : "Upload failed. Please try again.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      setTheme({ ...theme, logoUrl: url });
      notify("success", "Logo uploaded.");
    } catch {
      notify("error", "Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <span className="field__label">Logo image</span>
      <input aria-label="Upload logo" type="file" accept="image/*" disabled={busy} onChange={(e) => void onChange(e)} />
      {theme.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={theme.logoUrl} alt="Current logo" className="asset-thumb" />
      ) : null}
      {busy ? <small className="meter">Uploading…</small> : null}
    </div>
  );
}
