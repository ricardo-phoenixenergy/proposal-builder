"use client";

import { useMemo, useState } from "react";
import {
  getSectionType,
  validateLayout,
  sampleDataForType,
  type Block,
  type SectionLayout,
} from "@proposal/shared";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { defaultTheme } from "../../theme/defaultTheme";
import { LayoutRenderer } from "../../render/LayoutRenderer";
import { createLayout, updateLayout } from "../../client/layouts";
import { useProposalStore } from "../../state/proposalStore";
import { getAtPath, insertChild } from "./layoutTree";
import { PALETTE, blankBlock } from "./layout/blockOps";
import { BlockTree } from "./layout/BlockTree";
import { BlockStylePanel } from "./layout/BlockStylePanel";

export function LayoutEditor({
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
  const [root, setRoot] = useState<Block>(initial?.root ?? { kind: "stack", children: [] });
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const typeSchema = getSectionType(type);
  const sample = useMemo(() => sampleDataForType(type), [type]);

  const layout: SectionLayout = {
    type,
    variant: variant.trim(),
    pageFormat,
    name: name.trim(),
    root,
    version: (initial?.version ?? 0) + 1,
  };
  const slugOk = /^[a-z][a-z0-9_]*$/.test(variant.trim());
  const result = typeSchema ? validateLayout(layout, typeSchema) : { valid: false, errors: [] };
  const canSave = !!name.trim() && slugOk && result.valid && !busy;

  const addBlock = (kind: string) => {
    const target = getAtPath(root, selected);
    const parentPath = target && target.kind === "stack" ? selected : [];
    setRoot(insertChild(root, parentPath, blankBlock(kind)));
  };

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      if (editing) await updateLayout(type, layout.variant, pageFormat, layout);
      else await createLayout(layout);
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

      <div className="field">
        <span className="field__label">Add block</span>
        <div className="ltree__palette">
          {PALETTE.map((p) => (
            <button
              key={p.kind}
              type="button"
              className="btn"
              aria-label={`add ${p.label}`}
              onClick={() => addBlock(p.kind)}
            >
              + {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Blocks</span>
        <button
          type="button"
          className="btn btn--ghost"
          aria-label="select-root"
          onClick={() => setSelected([])}
        >
          {selected.length === 0 ? "▸ " : ""}root ({root.kind})
        </button>
        <ul className="ltree">
          <BlockTree
            root={root}
            selected={selected}
            typeSchema={typeSchema}
            onRootChange={setRoot}
            onSelect={setSelected}
          />
        </ul>
      </div>

      <BlockStylePanel
        root={root}
        selected={selected}
        typeSchema={typeSchema}
        onRootChange={setRoot}
      />

      <div className="field">
        <span className="field__label">Preview ({type})</span>
        <div className="editor-frame" data-layout-preview>
          <ThemeProvider theme={defaultTheme}>
            <LayoutRenderer
              layout={layout}
              data={sample}
              theme={defaultTheme}
              pageFormat={pageFormat}
            />
          </ThemeProvider>
        </div>
      </div>

      {!result.valid && (root as { children: Block[] }).children.length > 0 ? (
        <ul className="notice notice--warn">
          {result.errors.slice(0, 6).map((e, i) => (
            <li key={i}>
              <code>{e.path}</code> — {e.message}
            </li>
          ))}
        </ul>
      ) : null}

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
