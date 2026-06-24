"use client";

import type { ReactNode } from "react";
import type { Block, BlockBackground, BlockStyle, SectionTypeSchema } from "@proposal/shared";
import {
  TOKEN_COLORS,
  TOKEN_FONTS,
  SIZE_SCALES,
  SPACE_SCALES,
  ALIGNS,
  WEIGHTS,
} from "@proposal/shared";
import { defaultTheme } from "../../../theme/defaultTheme";
import { getAtPath, updateAtPath } from "../layoutTree";
import { setStyleProp, patchBackground } from "./blockOps";

export function BlockStylePanel({
  root,
  selected,
  typeSchema,
  onRootChange,
}: {
  root: Block;
  selected: number[];
  typeSchema: SectionTypeSchema | undefined;
  onRootChange: (next: Block) => void;
}): ReactNode {
  const selectedBlock = getAtPath(root, selected);
  if (!selectedBlock) return null;
  const selStyle: BlockStyle = ("style" in selectedBlock ? selectedBlock.style : undefined) ?? {};

  return (
    <div className="field">
      <span className="field__label">Style · {selectedBlock.kind}</span>
      <div className="lstyle">
        <label className="lstyle__row">
          Font
          <select
            aria-label="style-font"
            value={selStyle.font ?? ""}
            onChange={(e) => onRootChange(setStyleProp(root, selected, "font", e.target.value))}
          >
            <option value="">default</option>
            {TOKEN_FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="lstyle__row">
          Size
          <select
            aria-label="style-size"
            value={selStyle.size ?? ""}
            onChange={(e) => onRootChange(setStyleProp(root, selected, "size", e.target.value))}
          >
            <option value="">default</option>
            {SIZE_SCALES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="lstyle__row">
          Weight
          <select
            aria-label="style-weight"
            value={selStyle.weight ?? ""}
            onChange={(e) => onRootChange(setStyleProp(root, selected, "weight", e.target.value))}
          >
            <option value="">default</option>
            {WEIGHTS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className="lstyle__row">
          Align
          <select
            aria-label="style-align"
            value={selStyle.align ?? ""}
            onChange={(e) => onRootChange(setStyleProp(root, selected, "align", e.target.value))}
          >
            <option value="">default</option>
            {ALIGNS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="lstyle__row">
          Padding
          <select
            aria-label="style-padding"
            value={selStyle.padding ?? ""}
            onChange={(e) => onRootChange(setStyleProp(root, selected, "padding", e.target.value))}
          >
            <option value="">default</option>
            {SPACE_SCALES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="lstyle__row">
          Color
          <div className="lswatches">
            <button
              type="button"
              aria-label="color-none"
              className="lswatch lswatch--none"
              onClick={() => onRootChange(setStyleProp(root, selected, "color", ""))}
            >
              —
            </button>
            {TOKEN_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`color-${c}`}
                className="lswatch"
                style={{ background: defaultTheme.colors[c] }}
                onClick={() => onRootChange(setStyleProp(root, selected, "color", c))}
              />
            ))}
          </div>
        </div>
        <div className="lstyle__row">
          Background
          <div className="lswatches">
            <button
              type="button"
              aria-label="bg-none"
              className="lswatch lswatch--none"
              onClick={() => onRootChange(setStyleProp(root, selected, "background", ""))}
            >
              —
            </button>
            {TOKEN_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`bg-${c}`}
                className="lswatch"
                style={{ background: defaultTheme.colors[c] }}
                onClick={() => onRootChange(setStyleProp(root, selected, "background", c))}
              />
            ))}
          </div>
        </div>
        {selectedBlock.kind === "stack" || selectedBlock.kind === "columns" ? (
          <label className="lstyle__row">
            Gap
            <select
              aria-label="style-gap"
              value={"gap" in selectedBlock ? (selectedBlock.gap ?? "") : ""}
              onChange={(e) =>
                onRootChange(
                  updateAtPath(
                    root,
                    selected,
                    (b) => ({ ...b, gap: e.target.value || undefined }) as Block,
                  ),
                )
              }
            >
              <option value="">default</option>
              {SPACE_SCALES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {selectedBlock.kind === "columns" ? (
          <label className="lstyle__row">
            Columns
            <select
              aria-label="style-columns"
              value={selectedBlock.columns.length}
              onChange={(e) => {
                const n = Number(e.target.value);
                onRootChange(
                  updateAtPath(root, selected, (b) => {
                    const cols = (b as { columns: Block[][] }).columns;
                    const next = cols.slice(0, n);
                    while (next.length < n) next.push([{ kind: "stack", children: [] }]);
                    return { ...b, columns: next } as Block;
                  }),
                );
              }}
            >
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {selectedBlock.kind === "stack" || selectedBlock.kind === "columns" ? (
          <fieldset className="lbg">
            <legend className="field__label">Background</legend>
            <label className="lstyle__row">
              Bind image field
              <select
                aria-label="bg-image-field"
                value={
                  selectedBlock.background?.image && "field" in selectedBlock.background.image
                    ? selectedBlock.background.image.field
                    : ""
                }
                onChange={(e) => {
                  const field = e.target.value;
                  if (field) {
                    onRootChange(patchBackground(root, selected, { image: { field } }));
                  } else {
                    // "— none —": drop the image key entirely (don't leave a stale binding)
                    onRootChange(
                      updateAtPath(root, selected, (b) => {
                        if ((b.kind !== "stack" && b.kind !== "columns") || !b.background) return b;
                        const { image: _drop, ...restBg } = b.background;
                        return { ...b, background: restBg };
                      }),
                    );
                  }
                }}
              >
                <option value="">— none —</option>
                {(typeSchema?.fields ?? [])
                  .filter((f) => f.type === "image")
                  .map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label ?? f.key}
                    </option>
                  ))}
              </select>
            </label>
            <label className="lstyle__row">
              Overlay color
              <select
                aria-label="bg-overlay-color"
                value={selectedBlock.background?.overlay?.color ?? ""}
                onChange={(e) => {
                  const color = e.target.value;
                  const prev = selectedBlock.background?.overlay;
                  onRootChange(
                    patchBackground(root, selected, {
                      overlay: color
                        ? {
                            color: color as (typeof TOKEN_COLORS)[number],
                            opacity: prev?.opacity ?? 50,
                          }
                        : undefined,
                    } as Partial<BlockBackground>),
                  );
                }}
              >
                <option value="">— none —</option>
                {TOKEN_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="lstyle__row">
              Overlay opacity
              <input
                aria-label="bg-overlay-opacity"
                type="number"
                min={0}
                max={100}
                value={selectedBlock.background?.overlay?.opacity ?? 0}
                onChange={(e) => {
                  const opacity = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  const color = selectedBlock.background?.overlay?.color ?? "text";
                  onRootChange(patchBackground(root, selected, { overlay: { color, opacity } }));
                }}
              />
            </label>
            <label className="lstyle__row">
              Position
              <select
                aria-label="bg-position"
                value={selectedBlock.background?.position ?? ""}
                onChange={(e) =>
                  onRootChange(
                    patchBackground(root, selected, {
                      position: (e.target.value || undefined) as never,
                    }),
                  )
                }
              >
                <option value="">default</option>
                <option value="cover">cover</option>
                <option value="contain">contain</option>
              </select>
            </label>
            <label className="lstyle__row">
              Min height
              <select
                aria-label="bg-minheight"
                value={selectedBlock.background?.minHeight ?? ""}
                onChange={(e) =>
                  onRootChange(
                    patchBackground(root, selected, {
                      minHeight: (e.target.value || undefined) as never,
                    }),
                  )
                }
              >
                <option value="">default</option>
                {SIZE_SCALES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                <option value="page">page</option>
              </select>
            </label>
            <button
              type="button"
              className="btn btn--ghost"
              aria-label="bg-clear"
              onClick={() =>
                onRootChange(
                  updateAtPath(root, selected, (b) => {
                    if (b.kind !== "stack" && b.kind !== "columns") return b;
                    const { background: _background, ...rest } = b as Block & {
                      background?: BlockBackground;
                    };
                    return rest;
                  }),
                )
              }
            >
              Clear background
            </button>
          </fieldset>
        ) : null}
      </div>
    </div>
  );
}
