"use client";

import { useState } from "react";
import { useProposalStore } from "../state/proposalStore";

/**
 * Manual upload control for an `image` content field (§I). Posts the file to the
 * shared `/api/assets` route (Vercel Blob) and reports the returned URL via
 * `onChange`; the caller writes it into `data[field]`. Never AI-composed —
 * mirrors the logo uploader, but writes section content instead of the theme.
 */
export function ImageField({
  label,
  fieldKey,
  value,
  disabled,
  onChange,
}: {
  label: string;
  fieldKey: string;
  value: string;
  disabled?: boolean;
  onChange: (url: string) => void;
}) {
  const notify = useProposalStore((s) => s.notify);
  const [busy, setBusy] = useState(false);

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
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
      onChange(url);
      notify("success", "Image uploaded.");
    } catch {
      notify("error", "Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <input
        aria-label={`upload-${fieldKey}`}
        type="file"
        accept="image/*"
        disabled={disabled || busy}
        onChange={(e) => void upload(e)}
      />
      {value ? <img src={value} alt={label} className="asset-thumb" /> : null}
      {busy ? <small className="meter">Uploading…</small> : null}
    </div>
  );
}
