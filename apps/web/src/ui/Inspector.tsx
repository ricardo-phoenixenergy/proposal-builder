"use client";

import { useState } from "react";
import {
  fieldKind,
  getSectionType,
  isFieldLocked,
  isStructureLocked,
  isThemePinned,
  openTemplate,
  PAGE_FORMATS,
  variantRangeWarnings,
} from "@proposal/shared";
import { resolveSection } from "../registry/componentRegistry";
import { useProposalStore } from "../state/proposalStore";
import { requestFieldGeneration, requestSectionGeneration } from "../client/generate";
import { themes } from "../theme/themes";
import { ThemeForm } from "./ThemeForm";
import { CodeEditor } from "./CodeEditor";
import { DataGrid } from "./DataGrid";
import { ColumnMapping } from "./ColumnMapping";
import { MatrixEditor } from "./MatrixEditor";
import { AssetUpload } from "./AssetUpload";
import { ImageField } from "./ImageField";

type Tab = "tokens" | "code";

/**
 * Right pane: a collapsible Document disclosure (template + theme) atop an AI
 * workspace — the proposal brief, a section-rewrite instruction, and a
 * schema-driven field area (text fields AI-composable, data fields manual).
 */
export function Inspector() {
  const document = useProposalStore((s) => s.document);
  const theme = useProposalStore((s) => s.theme);
  const selectedId = useProposalStore((s) => s.selectedId);
  const sections = useProposalStore((s) => s.document.sections);
  const setVariant = useProposalStore((s) => s.setVariant);
  const setSectionData = useProposalStore((s) => s.setSectionData);
  const setSectionType = useProposalStore((s) => s.setSectionType);
  const applyTemplateAction = useProposalStore((s) => s.applyTemplate);
  const templates = useProposalStore((s) => s.templates);
  const setBrief = useProposalStore((s) => s.setBrief);
  const notify = useProposalStore((s) => s.notify);

  const setPageBreakBefore = useProposalStore((s) => s.setPageBreakBefore);
  const forkTheme = useProposalStore((s) => s.forkTheme);
  const unforkTheme = useProposalStore((s) => s.unforkTheme);
  const selectPreset = useProposalStore((s) => s.selectPreset);
  const setPageFormat = useProposalStore((s) => s.setPageFormat);
  const setPageMode = useProposalStore((s) => s.setPageMode);
  const isForked = document.theme !== undefined;

  const [tab, setTab] = useState<Tab>("tokens");
  const [docOpen, setDocOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sectionInstruction, setSectionInstruction] = useState("");
  const [fieldInstr, setFieldInstr] = useState<Record<string, string>>({});

  const brief = document.brief ?? "";
  const template = templates.find((t) => t.id === document.templateId) ?? openTemplate;
  const pinned = isThemePinned(template);
  const structureLocked = isStructureLocked(template);

  const selectedIndex = sections.findIndex((s) => s.id === selectedId);
  const selected = selectedIndex >= 0 ? sections[selectedIndex] : undefined;
  const slot = selectedIndex >= 0 ? template.slots[selectedIndex] : undefined;
  const choiceSlot = slot?.kind === "choice" ? slot : undefined;
  const typeSchema = selected ? getSectionType(selected.type) : undefined;
  const variants = typeSchema?.variants ?? [];
  const rangeWarnings = selected ? variantRangeWarnings(selected) : [];
  const isUnstyled = selected ? resolveSection(selected).unstyled : false;
  const hasAiFields = (typeSchema?.fields ?? []).some((f) => fieldKind(f) === "ai");

  const setField = (key: string, value: unknown) => {
    if (!selected) return;
    setSectionData(selected.id, { ...selected.data, [key]: value });
  };

  const rewriteSection = async () => {
    if (!selected) return;
    setBusy(true);
    const result = await requestSectionGeneration({
      type: selected.type,
      brief,
      instruction: sectionInstruction,
      sectionId: selected.id,
    });
    setBusy(false);
    if (result.ok && result.data) {
      setSectionData(selected.id, { ...selected.data, ...result.data }); // merge: keep data/manual fields
      notify("success", "Section rewritten.");
    } else {
      notify("error", result.error ?? "Generation failed");
    }
  };

  const rewriteField = async (key: string) => {
    if (!selected) return;
    setBusy(true);
    const current = typeof selected.data[key] === "string" ? (selected.data[key] as string) : "";
    const result = await requestFieldGeneration({
      type: selected.type,
      fieldKey: key,
      brief,
      instruction: fieldInstr[key] ?? "",
      currentValue: current,
      sectionId: selected.id,
    });
    setBusy(false);
    if (result.ok) {
      setField(key, result.value);
      notify("success", "Field rewritten.");
    } else {
      notify("error", result.error ?? "Generation failed");
    }
  };

  return (
    <aside aria-label="Inspector" className="pane inspector">
      {/* Document disclosure: template + theme */}
      <div className="group">
        <button type="button" className="group__title group__toggle" aria-expanded={docOpen} onClick={() => setDocOpen((v) => !v)}>
          Document {docOpen ? "▾" : "▸"}
        </button>
        {docOpen ? (
          <>
            <div className="field">
              <span className="field__label">Template</span>
              <select aria-label="Template" value={document.templateId} onChange={(e) => applyTemplateAction(e.target.value)}>
                {templates
                  .filter((t) => !t.deprecated || t.id === document.templateId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
              {structureLocked ? <small className="meter">Structure & theme are locked by this template.</small> : null}
            </div>

            <div className="field">
              <span className="field__label">Page format</span>
              <select aria-label="Page format" value={document.pageFormat ?? "a4_portrait"} onChange={(e) => setPageFormat(e.target.value)}>
                {PAGE_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="field__label">Mode</span>
              <select aria-label="Page mode" value={document.pageMode ?? "report"} onChange={(e) => setPageMode(e.target.value as "report" | "slides")}>
                <option value="report">Report (flowing pages)</option>
                <option value="slides">Slides (one section per page)</option>
              </select>
            </div>

            <div className="group__sub">
              <div className="group__title">Theme{pinned ? " · pinned" : ""}</div>
              <fieldset disabled={pinned} style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="field">
                  <span className="field__label">Preset</span>
                  <select aria-label="Theme preset" value={isForked ? "custom" : theme.id} onChange={(e) => selectPreset(e.target.value)}>
                    {isForked ? <option value="custom">Custom (forked)</option> : null}
                    {themes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {!isForked ? (
                  <div className="field">
                    <button type="button" className="btn btn--ghost" onClick={forkTheme}>
                      Fork to edit
                    </button>
                    <small className="meter">Presets are read-only. Fork to customise colours, fonts, and the logo.</small>
                  </div>
                ) : (
                  <>
                    <div className="tabs" role="tablist" aria-label="Theme editor">
                      <button type="button" className="tab" role="tab" aria-selected={tab === "tokens"} onClick={() => setTab("tokens")}>
                        Tokens
                      </button>
                      <button type="button" className="tab" role="tab" aria-selected={tab === "code"} onClick={() => setTab("code")}>
                        Code
                      </button>
                    </div>
                    {tab === "tokens" ? (
                      <ThemeForm />
                    ) : (
                      <div className="editor-frame">
                        <CodeEditor />
                      </div>
                    )}
                    <AssetUpload />
                    <div className="field">
                      <button type="button" className="btn btn--ghost" onClick={unforkTheme}>
                        Revert to preset
                      </button>
                    </div>
                  </>
                )}
              </fieldset>
            </div>
          </>
        ) : null}
      </div>

      {/* Proposal brief: global generation context */}
      <div className="group">
        <div className="group__title">Proposal brief</div>
        <div className="field">
          <textarea
            aria-label="brief"
            rows={3}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="What's this proposal about? (sent as context on every AI call)"
          />
        </div>
      </div>

      {selected && typeSchema ? (
        <div className="group">
          <div className="group__title">Section · {typeSchema.label}</div>

          {isUnstyled ? (
            <p className="notice notice--warn" data-flag="unstyled">
              No layout is registered for this section — it&apos;s rendering with the generic (unstyled) fallback.
            </p>
          ) : null}

          {rangeWarnings.length > 0 ? (
            <ul className="notice notice--warn" data-flag="range">
              {rangeWarnings.map((w) => (
                <li key={`${w.fieldKey}:${w.message}`}>{w.message}</li>
              ))}
            </ul>
          ) : null}

          {choiceSlot ? (
            <div className="field">
              <span className="field__label">Commercial model (choice slot)</span>
              <select aria-label="Choice type" value={selected.type} onChange={(e) => setSectionType(selected.id, e.target.value)}>
                {choiceSlot.allowed.map((t) => (
                  <option key={t} value={t}>
                    {getSectionType(t)?.label ?? t}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Section rewrite */}
          {hasAiFields ? (
            <div className="field">
              <span className="field__label">Rewrite section (all text fields)</span>
              <textarea
                aria-label="section-instruction"
                rows={2}
                value={sectionInstruction}
                onChange={(e) => setSectionInstruction(e.target.value)}
                placeholder="Optional instruction, e.g. 'make it more concise'"
              />
              <button type="button" className="btn btn--primary" disabled={busy} onClick={rewriteSection}>
                {busy ? "Working…" : "Rewrite section with AI"}
              </button>
            </div>
          ) : null}

          {/* Schema-driven field area */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {typeSchema.fields.map((field) => {
              const kind = fieldKind(field);
              const locked = isFieldLocked(template, selectedIndex, selected, field.key);
              const label = `${field.label ?? field.key}${field.required ? " *" : ""}${locked ? " · locked" : ""}`;

              if (kind === "data") {
                // Tabular fields use the dedicated editors (never AI).
                if (selected.type === "data_table") {
                  return (
                    <div className="field" key={field.key}>
                      <span className="field__label">{label}</span>
                      <DataGrid sectionId={selected.id} />
                      <ColumnMapping sectionId={selected.id} />
                    </div>
                  );
                }
                if (selected.type === "commercial_comparison") {
                  return (
                    <div className="field" key={field.key}>
                      <span className="field__label">{label}</span>
                      <MatrixEditor sectionId={selected.id} />
                    </div>
                  );
                }
                return null;
              }

              if (kind === "manual") {
                const value = typeof selected.data[field.key] === "string" ? (selected.data[field.key] as string) : "";
                if (field.type === "image") {
                  return (
                    <ImageField
                      key={field.key}
                      label={label}
                      fieldKey={field.key}
                      value={value}
                      disabled={locked}
                      onChange={(url) => setField(field.key, url)}
                    />
                  );
                }
                return (
                  <label className="field" key={field.key}>
                    <span className="field__label">{label}</span>
                    <input aria-label={`field-${field.key}`} value={value} readOnly={locked} disabled={locked} onChange={(e) => setField(field.key, e.target.value)} />
                  </label>
                );
              }

              // kind === "ai": text | paragraph | list
              const raw = selected.data[field.key];
              const isList = field.type === "list";
              const textValue = isList
                ? (Array.isArray(raw) ? (raw as string[]).join("\n") : "")
                : typeof raw === "string"
                  ? (raw as string)
                  : "";
              const onChange = (v: string) => setField(field.key, isList ? v.split("\n").filter((x) => x.length > 0) : v);

              return (
                <div className="field" key={field.key}>
                  <span className="field__label">{label}</span>
                  {field.type === "text" ? (
                    <input aria-label={`field-${field.key}`} value={textValue} readOnly={locked} disabled={locked} onChange={(e) => onChange(e.target.value)} />
                  ) : (
                    <textarea
                      aria-label={`field-${field.key}`}
                      rows={isList ? 4 : 3}
                      value={textValue}
                      readOnly={locked}
                      disabled={locked}
                      placeholder={isList ? "One item per line" : undefined}
                      onChange={(e) => onChange(e.target.value)}
                    />
                  )}
                  {!locked ? (
                    <div className="field field--row">
                      <input
                        aria-label={`instruction-${field.key}`}
                        placeholder="Field instruction (optional)"
                        value={fieldInstr[field.key] ?? ""}
                        onChange={(e) => setFieldInstr((m) => ({ ...m, [field.key]: e.target.value }))}
                      />
                      <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => rewriteField(field.key)}>
                        Rewrite field
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {!structureLocked ? (
            <label className="field field--row">
              <span className="field__label">Page break before this section</span>
              <input
                type="checkbox"
                aria-label="Page break before this section"
                checked={selected.pageBreakBefore ?? false}
                onChange={(e) => setPageBreakBefore(selected.id, e.target.checked)}
              />
            </label>
          ) : null}

          {!structureLocked && variants.length > 0 ? (
            <div className="field">
              <span className="field__label">Variant</span>
              <select value={selected.variant ?? typeSchema.defaultVariant ?? ""} onChange={(e) => setVariant(selected.id, e.target.value)}>
                {variants.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="group">
          <small className="meter">Select a section to edit it.</small>
        </div>
      )}
    </aside>
  );
}
