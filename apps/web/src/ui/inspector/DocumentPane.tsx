"use client";

import { useState } from "react";
import { isStructureLocked, isThemePinned, openTemplate, PAGE_FORMATS } from "@proposal/shared";
import { useShallow } from "zustand/react/shallow";
import { useProposalStore } from "../../state/proposalStore";
import { themes } from "../../theme/themes";
import { ThemeForm } from "../ThemeForm";
import { CodeEditor } from "../CodeEditor";
import { AssetUpload } from "../AssetUpload";

type Tab = "tokens" | "code";

export function DocumentPane() {
  const { templateId, pageFormat, pageMode } = useProposalStore(
    useShallow((s) => ({
      templateId: s.document.templateId,
      pageFormat: s.document.pageFormat,
      pageMode: s.document.pageMode,
    })),
  );
  const themeId = useProposalStore((s) => s.theme.id);
  const forked = useProposalStore((s) => s.document.theme !== undefined);
  const templates = useProposalStore((s) => s.templates);
  const applyTemplate = useProposalStore((s) => s.applyTemplate);
  const setPageFormat = useProposalStore((s) => s.setPageFormat);
  const setPageMode = useProposalStore((s) => s.setPageMode);
  const forkTheme = useProposalStore((s) => s.forkTheme);
  const unforkTheme = useProposalStore((s) => s.unforkTheme);
  const selectPreset = useProposalStore((s) => s.selectPreset);

  const [docOpen, setDocOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("tokens");

  const template = templates.find((t) => t.id === templateId) ?? openTemplate;
  const pinned = isThemePinned(template);
  const structureLocked = isStructureLocked(template);

  return (
    <div className="group">
      <button
        type="button"
        className="group__title group__toggle"
        aria-expanded={docOpen}
        onClick={() => setDocOpen((v) => !v)}
      >
        Document {docOpen ? "▾" : "▸"}
      </button>
      {docOpen ? (
        <>
          <div className="field">
            <span className="field__label">Template</span>
            <select
              aria-label="Template"
              value={templateId}
              onChange={(e) => applyTemplate(e.target.value)}
            >
              {templates
                .filter((t) => !t.deprecated || t.id === templateId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
            {structureLocked ? (
              <small className="meter">Structure & theme are locked by this template.</small>
            ) : null}
          </div>

          <div className="field">
            <span className="field__label">Page format</span>
            <select
              aria-label="Page format"
              value={pageFormat ?? "a4_portrait"}
              onChange={(e) => setPageFormat(e.target.value)}
            >
              {PAGE_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="field__label">Mode</span>
            <select
              aria-label="Page mode"
              value={pageMode ?? "report"}
              onChange={(e) => setPageMode(e.target.value as "report" | "slides")}
            >
              <option value="report">Report (flowing pages)</option>
              <option value="slides">Slides (one section per page)</option>
            </select>
          </div>

          <div className="group__sub">
            <div className="group__title">Theme{pinned ? " · pinned" : ""}</div>
            <fieldset
              disabled={pinned}
              style={{
                border: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div className="field">
                <span className="field__label">Preset</span>
                <select
                  aria-label="Theme preset"
                  value={forked ? "custom" : themeId}
                  onChange={(e) => selectPreset(e.target.value)}
                >
                  {forked ? <option value="custom">Custom (forked)</option> : null}
                  {themes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {!forked ? (
                <div className="field">
                  <button type="button" className="btn btn--ghost" onClick={forkTheme}>
                    Fork to edit
                  </button>
                  <small className="meter">
                    Presets are read-only. Fork to customise colours, fonts, and the logo.
                  </small>
                </div>
              ) : (
                <>
                  <div className="tabs" role="tablist" aria-label="Theme editor">
                    <button
                      type="button"
                      className="tab"
                      role="tab"
                      aria-selected={tab === "tokens"}
                      onClick={() => setTab("tokens")}
                    >
                      Tokens
                    </button>
                    <button
                      type="button"
                      className="tab"
                      role="tab"
                      aria-selected={tab === "code"}
                      onClick={() => setTab("code")}
                    >
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
  );
}
