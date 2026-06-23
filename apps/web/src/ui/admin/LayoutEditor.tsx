"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  getSectionType, validateLayout, LEAF_KINDS, sampleDataForType,
  TOKEN_COLORS, TOKEN_FONTS, SIZE_SCALES, SPACE_SCALES, ALIGNS, WEIGHTS,
  type Block, type BlockStyle, type FieldType, type SectionLayout,
} from "@proposal/shared";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { defaultTheme } from "../../theme/defaultTheme";
import { LayoutRenderer } from "../../render/LayoutRenderer";
import { createLayout, updateLayout } from "../../client/layouts";
import { useProposalStore } from "../../state/proposalStore";
import { getAtPath, insertChild, moveAtPath, removeAtPath, updateAtPath } from "./layoutTree";

/** Which content field types each binding block accepts (mirrors the validator). */
const BINDING: Partial<Record<string, FieldType[]>> = {
  heading: ["text", "paragraph"],
  paragraph: ["text", "paragraph"],
  list: ["list"],
  table: ["dataset"],
  chart: ["dataset"],
  matrix: ["matrix"],
};
const STATIC_KINDS = ["callout", "text"];
// keyValue is excluded from 5a (it needs the multi-field editor that lands in 5b).
const PALETTE: { kind: string; label: string }[] = [
  { kind: "stack", label: "Stack" },
  ...LEAF_KINDS.filter((k) => k !== "keyValue").map((k) => ({ kind: k, label: k })),
];

/** Set one BlockStyle prop (or clear it when value is "") on the block at `path`. */
function setStyleProp(root: Block, path: number[], prop: keyof BlockStyle, value: string): Block {
  return updateAtPath(root, path, (b) => {
    const style: BlockStyle = { ...(("style" in b ? b.style : undefined) ?? {}) };
    if (value === "") delete style[prop];
    else (style as Record<string, string>)[prop] = value;
    return { ...b, style } as Block;
  });
}

/** A default block for a palette kind. */
function blankBlock(kind: string): Block {
  if (kind === "stack") return { kind: "stack", children: [] };
  if (kind === "chart") return { kind: "chart", field: "", chart: "bar" } as Block;
  if (STATIC_KINDS.includes(kind)) return { kind, text: "" } as Block;
  if (kind === "logo" || kind === "divider") return { kind } as Block;
  return { kind, field: "" } as Block; // heading/paragraph/list/table/matrix
}

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
    type, variant: variant.trim(), pageFormat, name: name.trim(),
    root, version: (initial?.version ?? 0) + 1,
  };
  const slugOk = /^[a-z][a-z0-9_]*$/.test(variant.trim());
  const result = typeSchema ? validateLayout(layout, typeSchema) : { valid: false, errors: [] };
  const canSave = !!name.trim() && slugOk && result.valid && !busy;

  const selectedBlock = getAtPath(root, selected);
  const selStyle: BlockStyle = (selectedBlock && "style" in selectedBlock ? selectedBlock.style : undefined) ?? {};

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

  const renderRow = (block: Block, path: number[]): ReactNode => {
    const pid = path.join("-");
    const allowed = BINDING[block.kind];
    const isSelected = path.join() === selected.join();
    return (
      <li key={pid} className="ltree__row" data-block-kind={block.kind}>
        <div className="ltree__bar">
          <button type="button" className="btn btn--ghost" aria-label={`select-${pid}`} onClick={() => setSelected(path)}>
            {isSelected ? "▸ " : ""}{block.kind}
          </button>
          {allowed ? (
            <select
              aria-label={`bind-${pid}`}
              value={"field" in block ? block.field : ""}
              onChange={(e) => setRoot(updateAtPath(root, path, (b) => ({ ...b, field: e.target.value }) as Block))}
            >
              <option value="">— field —</option>
              {(typeSchema?.fields ?? [])
                .filter((f) => allowed.includes(f.type))
                .map((f) => (
                  <option key={f.key} value={f.key}>{f.label ?? f.key}</option>
                ))}
            </select>
          ) : null}
          {STATIC_KINDS.includes(block.kind) ? (
            <input
              aria-label={`text-${pid}`}
              value={"text" in block ? block.text : ""}
              onChange={(e) => setRoot(updateAtPath(root, path, (b) => ({ ...b, text: e.target.value }) as Block))}
              placeholder="Static text"
            />
          ) : null}
          <button type="button" className="btn btn--ghost" aria-label={`up-${pid}`} onClick={() => setRoot(moveAtPath(root, path, -1))}>↑</button>
          <button type="button" className="btn btn--ghost" aria-label={`down-${pid}`} onClick={() => setRoot(moveAtPath(root, path, 1))}>↓</button>
          <button type="button" className="btn btn--ghost" aria-label={`remove-${pid}`} onClick={() => setRoot(removeAtPath(root, path))}>✕</button>
        </div>
        {block.kind === "stack" ? (
          <ul className="ltree__children">{block.children.map((c, i) => renderRow(c, [...path, i]))}</ul>
        ) : null}
      </li>
    );
  };

  return (
    <div className="steditor">
      <h2>{editing ? "Edit layout" : "New layout"} · {typeSchema?.label ?? type}</h2>

      <label className="field">
        <span className="field__label">Layout name</span>
        <input aria-label="Layout name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cover" />
      </label>
      <label className="field">
        <span className="field__label">Layout variant (slug, immutable on edit)</span>
        <input aria-label="Layout variant" value={variant} disabled={editing} onChange={(e) => setVariant(e.target.value)} placeholder="cover" />
      </label>
      <p className="meter">Format: <strong>{pageFormat}</strong></p>

      <div className="field">
        <span className="field__label">Add block</span>
        <div className="ltree__palette">
          {PALETTE.map((p) => (
            <button key={p.kind} type="button" className="btn" aria-label={`add ${p.label}`} onClick={() => addBlock(p.kind)}>
              + {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Blocks</span>
        <ul className="ltree">{(root as { children: Block[] }).children.map((c, i) => renderRow(c, [i]))}</ul>
      </div>

      {selectedBlock ? (
        <div className="field">
          <span className="field__label">Style · {selectedBlock.kind}</span>
          <div className="lstyle">
            <label className="lstyle__row">Font
              <select aria-label="style-font" value={selStyle.font ?? ""} onChange={(e) => setRoot(setStyleProp(root, selected, "font", e.target.value))}>
                <option value="">default</option>
                {TOKEN_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="lstyle__row">Size
              <select aria-label="style-size" value={selStyle.size ?? ""} onChange={(e) => setRoot(setStyleProp(root, selected, "size", e.target.value))}>
                <option value="">default</option>
                {SIZE_SCALES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="lstyle__row">Weight
              <select aria-label="style-weight" value={selStyle.weight ?? ""} onChange={(e) => setRoot(setStyleProp(root, selected, "weight", e.target.value))}>
                <option value="">default</option>
                {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </label>
            <label className="lstyle__row">Align
              <select aria-label="style-align" value={selStyle.align ?? ""} onChange={(e) => setRoot(setStyleProp(root, selected, "align", e.target.value))}>
                <option value="">default</option>
                {ALIGNS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="lstyle__row">Padding
              <select aria-label="style-padding" value={selStyle.padding ?? ""} onChange={(e) => setRoot(setStyleProp(root, selected, "padding", e.target.value))}>
                <option value="">default</option>
                {SPACE_SCALES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <div className="lstyle__row">Color
              <div className="lswatches">
                <button type="button" aria-label="color-none" className="lswatch lswatch--none" onClick={() => setRoot(setStyleProp(root, selected, "color", ""))}>—</button>
                {TOKEN_COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`color-${c}`} className="lswatch"
                    style={{ background: defaultTheme.colors[c] }} onClick={() => setRoot(setStyleProp(root, selected, "color", c))} />
                ))}
              </div>
            </div>
            <div className="lstyle__row">Background
              <div className="lswatches">
                <button type="button" aria-label="bg-none" className="lswatch lswatch--none" onClick={() => setRoot(setStyleProp(root, selected, "background", ""))}>—</button>
                {TOKEN_COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`bg-${c}`} className="lswatch"
                    style={{ background: defaultTheme.colors[c] }} onClick={() => setRoot(setStyleProp(root, selected, "background", c))} />
                ))}
              </div>
            </div>
            {selectedBlock.kind === "stack" || selectedBlock.kind === "columns" ? (
              <label className="lstyle__row">Gap
                <select aria-label="style-gap" value={"gap" in selectedBlock ? selectedBlock.gap ?? "" : ""}
                  onChange={(e) => setRoot(updateAtPath(root, selected, (b) => ({ ...b, gap: e.target.value || undefined }) as Block))}>
                  <option value="">default</option>
                  {SPACE_SCALES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="field">
        <span className="field__label">Preview ({type})</span>
        <div className="editor-frame" data-layout-preview>
          <ThemeProvider theme={defaultTheme}>
            <LayoutRenderer layout={layout} data={sample} theme={defaultTheme} pageFormat={pageFormat} />
          </ThemeProvider>
        </div>
      </div>

      {!result.valid && (root as { children: Block[] }).children.length > 0 ? (
        <ul className="notice notice--warn">
          {result.errors.slice(0, 6).map((e, i) => (
            <li key={i}><code>{e.path}</code> — {e.message}</li>
          ))}
        </ul>
      ) : null}

      <div className="steditor__actions">
        <button type="button" className="btn btn--primary" disabled={!canSave} onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
