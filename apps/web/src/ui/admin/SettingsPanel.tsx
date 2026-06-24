"use client";

import { useState } from "react";
import { SELECTABLE_MODELS, type GenerationModelId } from "@proposal/shared";

/** Admin AI-model setting (§10). Applies to every generation call. */
export function SettingsPanel({ initialModel }: { initialModel: GenerationModelId }) {
  const [model, setModel] = useState<GenerationModelId>(initialModel);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const save = async () => {
    setStatus("saving");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aiModel: model }),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <section className="admin__panel">
      <h2 className="admin__panel-title">AI settings</h2>
      <p className="meter">The model used for every generation call across all proposals.</p>
      <label className="field">
        <span className="field__label">AI model</span>
        <select
          aria-label="AI model"
          value={model}
          onChange={(e) => setModel(e.target.value as GenerationModelId)}
        >
          {SELECTABLE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <button
          type="button"
          className="btn btn--primary"
          disabled={status === "saving"}
          onClick={save}
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        {status === "saved" ? <small className="meter">Saved.</small> : null}
        {status === "error" ? (
          <small className="meter" style={{ color: "var(--ui-danger)" }}>
            Couldn&apos;t save.
          </small>
        ) : null}
      </div>
    </section>
  );
}
