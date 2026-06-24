"use client";

import { useState } from "react";

export function PromptDialog({
  title,
  label,
  defaultValue = "",
  confirmLabel = "Save",
  onConfirm,
  onClose,
}: {
  title: string;
  label: string;
  defaultValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const trimmed = value.trim();
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal__card">
        <h2>{title}</h2>
        <label className="field">
          <span className="field__label">{label}</span>
          <input
            aria-label={label}
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={trimmed === ""}
            onClick={() => {
              onConfirm(trimmed);
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
