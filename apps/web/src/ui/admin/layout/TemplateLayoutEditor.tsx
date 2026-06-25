"use client";

import MonacoEditor from "@monaco-editor/react";
import { useMemo, useState } from "react";
import {
  getSectionType,
  validateLayout,
  sampleDataForType,
  sanitizeLayoutHtml,
  interpolate,
  type SectionLayout,
} from "@proposal/shared";
import { ThemeProvider } from "../../../theme/ThemeProvider";
import { defaultTheme } from "../../../theme/defaultTheme";
import { TemplateRenderer } from "../../../render/TemplateRenderer";
import { createLayout, updateLayout } from "../../../client/layouts";
import { useProposalStore } from "../../../state/proposalStore";
import { fieldReference } from "./fieldReference";

export function TemplateLayoutEditor({
  type,
  pageFormat,
  initial,
  mode,
  onDone,
  onCancel,
}: {
  type: string;
  pageFormat: string;
  initial?: SectionLayout;
  mode: "create" | "edit";
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const notify = useProposalStore((s) => s.notify);
  const editing = mode === "edit";

  const [name, setName] = useState(initial?.name ?? "");
  const [variant, setVariant] = useState(initial?.variant ?? "");
  const [template, setTemplate] = useState(initial?.template ?? "");
  const [css, setCss] = useState(initial?.css ?? "");
  const [busy, setBusy] = useState(false);

  const typeSchema = getSectionType(type);
  const sample = useMemo(() => sampleDataForType(type), [type]);

  const draftLayout: SectionLayout = {
    type,
    variant: variant.trim(),
    pageFormat,
    name: name.trim(),
    version: (initial?.version ?? 0) + 1,
    ...(template ? { template } : {}),
    ...(css ? { css } : {}),
  };

  const slugOk = /^[a-z][a-z0-9_]*$/.test(variant.trim());
  const result = typeSchema
    ? validateLayout(draftLayout, typeSchema)
    : { valid: false, errors: [] };
  const canSave = !!name.trim() && !!variant.trim() && slugOk && result.valid && !busy;

  // Sanitizer notice: detect if sanitizeLayoutHtml strips anything from the interpolated output.
  const rawInterpolated = useMemo(
    () => (template ? interpolate(template, sample) : ""),
    [template, sample],
  );
  const sanitized = useMemo(
    () => (rawInterpolated ? sanitizeLayoutHtml(rawInterpolated) : ""),
    [rawInterpolated],
  );
  const sanitizerStripped = rawInterpolated !== sanitized;

  // Field reference list for this section type.
  const fieldRefs = useMemo(() => (typeSchema ? fieldReference(typeSchema) : []), [typeSchema]);

  const insertToken = (token: string) => {
    setTemplate((prev) => prev + token);
  };

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      if (editing) await updateLayout(type, draftLayout.variant, pageFormat, draftLayout);
      else await createLayout(draftLayout);
      notify("success", editing ? "Layout updated." : "Layout created.");
      await onDone();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="steditor">
      <h2>
        {editing ? "Edit layout" : "New layout"} · {typeSchema?.label ?? type}
      </h2>

      <label className="field">
        <span className="field__label">Layout name</span>
        <input
          aria-label="Layout name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Cover"
        />
      </label>

      <label className="field">
        <span className="field__label">Layout variant (slug, immutable on edit)</span>
        <input
          aria-label="Layout variant"
          value={variant}
          disabled={editing}
          onChange={(e) => setVariant(e.target.value)}
          placeholder="cover"
        />
      </label>

      <p className="meter">
        Format: <strong>{pageFormat}</strong>
      </p>

      {fieldRefs.length > 0 && (
        <div className="field">
          <span className="field__label">Field reference (click to insert)</span>
          <ul className="field-ref-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {fieldRefs.map((ref) => (
              <li key={ref.token}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  aria-label={`insert ${ref.label}`}
                  onClick={() => insertToken(ref.token)}
                  style={{ fontFamily: "monospace", fontSize: "0.85em" }}
                >
                  <code>{ref.token}</code>{" "}
                  <span style={{ opacity: 0.6 }}>
                    {ref.label} ({ref.kind})
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="field">
        <span className="field__label">Template HTML</span>
        <div style={{ height: 240, border: "1px solid var(--c-line, #e2e2e2)" }}>
          <MonacoEditor
            height="100%"
            defaultLanguage="html"
            language="html"
            aria-label="template-html"
            options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
            value={template}
            onChange={(val) => setTemplate(val ?? "")}
          />
        </div>
      </div>

      <div className="field">
        <span className="field__label">Template CSS (scoped automatically)</span>
        <div style={{ height: 160, border: "1px solid var(--c-line, #e2e2e2)" }}>
          <MonacoEditor
            height="100%"
            defaultLanguage="css"
            language="css"
            aria-label="template-css"
            options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
            value={css}
            onChange={(val) => setCss(val ?? "")}
          />
        </div>
      </div>

      {sanitizerStripped && (
        <p className="notice notice--warn" role="alert">
          Some HTML was stripped by the sanitizer. Scripts, event handlers, and forbidden tags are
          not allowed in templates.
        </p>
      )}

      <div className="field">
        <span className="field__label">Preview ({type})</span>
        <div className="editor-frame" data-layout-preview>
          <ThemeProvider theme={defaultTheme}>
            <TemplateRenderer
              layout={draftLayout}
              data={sample}
              pageFormat={pageFormat}
              theme={defaultTheme}
            />
          </ThemeProvider>
        </div>
      </div>

      <div className="steditor__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!canSave}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
