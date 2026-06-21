"use client";

import { useState } from "react";
import {
  SELECTABLE_MODELS,
  getSectionType,
  isStructureLocked,
  isThemePinned,
  openTemplate,
  variantRangeWarnings,
} from "@proposal/shared";
import { resolveSection } from "../registry/componentRegistry";
import { useProposalStore } from "../state/proposalStore";
import { requestSectionGeneration } from "../client/generate";
import { themes } from "../theme/themes";
import { ThemeForm } from "./ThemeForm";
import { CodeEditor } from "./CodeEditor";
import { CopyFields } from "./CopyFields";
import { DataGrid } from "./DataGrid";
import { ColumnMapping } from "./ColumnMapping";
import { MatrixEditor } from "./MatrixEditor";
import { AssetUpload } from "./AssetUpload";

type Tab = "tokens" | "code";

/**
 * Right pane: template + theme + AI settings, and per-section editors that honor
 * the active template's locks (§7) — pinned theme, choice-slot toggle, locked
 * fields, hidden variant picker when the structure is locked.
 */
export function Inspector() {
  const document = useProposalStore((s) => s.document);
  const theme = useProposalStore((s) => s.theme);
  const forkTheme = useProposalStore((s) => s.forkTheme);
  const unforkTheme = useProposalStore((s) => s.unforkTheme);
  const selectPreset = useProposalStore((s) => s.selectPreset);
  const isForked = useProposalStore((s) => s.document.theme !== undefined);
  const selectedId = useProposalStore((s) => s.selectedId);
  const sections = useProposalStore((s) => s.document.sections);
  const setVariant = useProposalStore((s) => s.setVariant);
  const setSectionData = useProposalStore((s) => s.setSectionData);
  const setSectionType = useProposalStore((s) => s.setSectionType);
  const applyTemplateAction = useProposalStore((s) => s.applyTemplate);
  const templates = useProposalStore((s) => s.templates);
  const model = useProposalStore((s) => s.model);
  const setModel = useProposalStore((s) => s.setModel);
  const brief = useProposalStore((s) => s.brief);
  const setBrief = useProposalStore((s) => s.setBrief);
  const notify = useProposalStore((s) => s.notify);
  const [tab, setTab] = useState<Tab>("tokens");
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const template = templates.find((t) => t.id === document.templateId) ?? openTemplate;
  const pinned = isThemePinned(template);
  const structureLocked = isStructureLocked(template);

  const selectedIndex = sections.findIndex((s) => s.id === selectedId);
  const selected = selectedIndex >= 0 ? sections[selectedIndex] : undefined;
  const slot = selectedIndex >= 0 ? template.slots[selectedIndex] : undefined;
  const choiceSlot = slot?.kind === "choice" ? slot : undefined;
  const typeSchema = selected ? getSectionType(selected.type) : undefined;
  const variants = typeSchema?.variants ?? [];
  const canGenerate = typeSchema?.category === "text";
  const rangeWarnings = selected ? variantRangeWarnings(selected) : [];
  const isUnstyled = selected ? resolveSection(selected).unstyled : false;

  const onRegenerate = async () => {
    if (!selected) return;
    setBusy(true);
    setGenError(null);
    const result = await requestSectionGeneration({ type: selected.type, brief, model, sectionId: selected.id });
    setBusy(false);
    if (result.ok && result.data) {
      setSectionData(selected.id, result.data);
      notify("success", "Section regenerated.");
    } else {
      const message = result.error ?? "Generation failed";
      setGenError(message);
      notify("error", message);
    }
  };

  return (
    <aside aria-label="Inspector" className="pane inspector">
      <div className="group">
        <div className="group__title">Template</div>
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
      </div>

      <div className="group">
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

      <div className="group">
        <div className="group__title">AI</div>
        <div className="field">
          <span className="field__label">Model</span>
          <select aria-label="Model" value={model} onChange={(e) => setModel(e.target.value as typeof model)}>
            {SELECTABLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="field__label">Brief</span>
          <textarea
            aria-label="brief"
            rows={3}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="What's this proposal about? (used when generating copy)"
          />
        </div>
      </div>

      {selected ? (
        <div className="group">
          <div className="group__title">Section · {typeSchema?.label ?? selected.type}</div>

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
              <select
                aria-label="Choice type"
                value={selected.type}
                onChange={(e) => setSectionType(selected.id, e.target.value)}
              >
                {choiceSlot.allowed.map((t) => (
                  <option key={t} value={t}>
                    {getSectionType(t)?.label ?? t}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {canGenerate ? (
            <div className="field">
              <button type="button" className="btn btn--primary" disabled={busy} onClick={onRegenerate}>
                {busy ? "Generating…" : "Regenerate with AI"}
              </button>
              {genError ? <small className="meter" style={{ color: "var(--ui-warn)" }}>{genError}</small> : null}
            </div>
          ) : null}

          <CopyFields sectionId={selected.id} slotIndex={selectedIndex} />

          {selected.type === "data_table" ? (
            <>
              <DataGrid sectionId={selected.id} />
              <ColumnMapping sectionId={selected.id} />
            </>
          ) : null}

          {selected.type === "commercial_comparison" ? <MatrixEditor sectionId={selected.id} /> : null}

          {!structureLocked && variants.length > 0 ? (
            <div className="field">
              <span className="field__label">Variant</span>
              <select
                value={selected.variant ?? typeSchema?.defaultVariant ?? ""}
                onChange={(e) => setVariant(selected.id, e.target.value)}
              >
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
