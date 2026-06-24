"use client";

import type { ReactNode } from "react";
import type { Block, SectionTypeSchema } from "@proposal/shared";
import { insertChild, moveAtPath, removeAtPath, updateAtPath } from "../layoutTree";
import { BINDING, STATIC_KINDS, blankBlock } from "./blockOps";

export function BlockTree({
  root,
  selected,
  typeSchema,
  onRootChange,
  onSelect,
}: {
  root: Block;
  selected: number[];
  typeSchema: SectionTypeSchema | undefined;
  onRootChange: (next: Block) => void;
  onSelect: (path: number[]) => void;
}): ReactNode {
  const renderRow = (block: Block, path: number[]): ReactNode => {
    const pid = path.join("-");
    const allowed = BINDING[block.kind];
    const isSelected = path.join() === selected.join();
    return (
      <li key={pid} className="ltree__row" data-block-kind={block.kind}>
        <div className="ltree__bar">
          <button
            type="button"
            className="btn btn--ghost"
            aria-label={`select-${pid}`}
            onClick={() => onSelect(path)}
          >
            {isSelected ? "▸ " : ""}
            {block.kind}
          </button>
          {allowed ? (
            <select
              aria-label={`bind-${pid}`}
              value={"field" in block ? block.field : ""}
              onChange={(e) =>
                onRootChange(
                  updateAtPath(root, path, (b) => ({ ...b, field: e.target.value }) as Block),
                )
              }
            >
              <option value="">— field —</option>
              {(typeSchema?.fields ?? [])
                .filter((f) => allowed.includes(f.type))
                .map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label ?? f.key}
                  </option>
                ))}
            </select>
          ) : null}
          {STATIC_KINDS.includes(block.kind) ? (
            <input
              aria-label={`text-${pid}`}
              value={"text" in block ? block.text : ""}
              onChange={(e) =>
                onRootChange(
                  updateAtPath(root, path, (b) => ({ ...b, text: e.target.value }) as Block),
                )
              }
              placeholder="Static text"
            />
          ) : null}
          <button
            type="button"
            className="btn btn--ghost"
            aria-label={`up-${pid}`}
            onClick={() => onRootChange(moveAtPath(root, path, -1))}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            aria-label={`down-${pid}`}
            onClick={() => onRootChange(moveAtPath(root, path, 1))}
          >
            ↓
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            aria-label={`remove-${pid}`}
            onClick={() => onRootChange(removeAtPath(root, path))}
          >
            ✕
          </button>
        </div>
        {block.kind === "keyValue" ? (
          <div className="ltree__kv">
            {block.fields.map((fk, fi) => (
              <div key={fi} className="lstyle__row">
                <select
                  aria-label={`kv-field-${pid}-${fi}`}
                  value={fk}
                  onChange={(e) =>
                    onRootChange(
                      updateAtPath(root, path, (b) => {
                        const fields = [...(b as { fields: string[] }).fields];
                        fields[fi] = e.target.value;
                        return { ...b, fields } as Block;
                      }),
                    )
                  }
                >
                  <option value="">— field —</option>
                  {(typeSchema?.fields ?? [])
                    .filter((f) => f.type === "text" || f.type === "paragraph")
                    .map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label ?? f.key}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="btn btn--ghost"
                  aria-label={`kv-remove-${pid}-${fi}`}
                  onClick={() =>
                    onRootChange(
                      updateAtPath(
                        root,
                        path,
                        (b) =>
                          ({
                            ...b,
                            fields: (b as { fields: string[] }).fields.filter((_, i) => i !== fi),
                          }) as Block,
                      ),
                    )
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn--ghost"
              aria-label={`kv-add-${pid}`}
              onClick={() =>
                onRootChange(
                  updateAtPath(
                    root,
                    path,
                    (b) => ({ ...b, fields: [...(b as { fields: string[] }).fields, ""] }) as Block,
                  ),
                )
              }
            >
              + field
            </button>
          </div>
        ) : null}
        {block.kind === "stack" ? (
          <ul className="ltree__children">
            {block.children.map((c, i) => renderRow(c, [...path, i]))}
          </ul>
        ) : block.kind === "columns" ? (
          <div className="ltree__columns">
            {block.columns.map((col, ci) => (
              <div key={ci} className="ltree__column" data-column={ci}>
                <div className="meter">col {ci + 1}</div>
                <button
                  type="button"
                  className="btn btn--ghost"
                  aria-label={`add-to-column-${path.join("-")}-${ci}-0`}
                  onClick={() =>
                    onRootChange(insertChild(root, [...path, ci, 0], blankBlock("heading")))
                  }
                >
                  + heading
                </button>
                {/* each column holds one nested stack at index 0 */}
                <ul className="ltree__children">
                  {(col[0] && col[0].kind === "stack" ? col[0].children : []).map((c, j) =>
                    renderRow(c, [...path, ci, 0, j]),
                  )}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </li>
    );
  };

  return <>{(root as { children: Block[] }).children.map((c, i) => renderRow(c, [i]))}</>;
}
