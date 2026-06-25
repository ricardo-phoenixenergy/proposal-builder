import type { Block, BlockStyle, BlockBackground, FieldType } from "@proposal/shared";
import { LEAF_KINDS } from "@proposal/shared";
import { updateAtPath } from "../layoutTree";

/** Which content field types each binding block accepts (mirrors the validator). */
export const BINDING: Partial<Record<string, FieldType[]>> = {
  heading: ["text", "paragraph"],
  paragraph: ["text", "paragraph"],
  list: ["list"],
  table: ["dataset"],
  chart: ["dataset"],
  matrix: ["matrix"],
  image: ["image"],
};

export const STATIC_KINDS = ["callout", "text"];

export const PALETTE: { kind: string; label: string }[] = [
  { kind: "stack", label: "Stack" },
  { kind: "columns", label: "Columns" },
  ...LEAF_KINDS.map((k) => ({ kind: k, label: k })),
];

/** Set one BlockStyle prop (or clear it when value is "") on the block at `path`. */
export function setStyleProp(
  root: Block,
  path: number[],
  prop: keyof BlockStyle,
  value: string,
): Block {
  return updateAtPath(root, path, (b) => {
    const style: BlockStyle = { ...(("style" in b ? b.style : undefined) ?? {}) };
    if (value === "") delete style[prop];
    else (style as Record<string, string>)[prop] = value;
    return { ...b, style };
  });
}

/** Merge a partial BlockBackground into the container at `path` (creates it if absent). */
export function patchBackground(
  root: Block,
  path: number[],
  patch: Partial<BlockBackground>,
): Block {
  return updateAtPath(root, path, (b) => {
    if (b.kind !== "stack" && b.kind !== "columns") return b;
    const bg: BlockBackground = { ...(b.background ?? {}), ...patch };
    return { ...b, background: bg };
  });
}

/** A default block for a palette kind. */
export function blankBlock(kind: string): Block {
  if (kind === "stack") return { kind: "stack", children: [] };
  if (kind === "columns")
    return {
      kind: "columns",
      columns: [[{ kind: "stack", children: [] }], [{ kind: "stack", children: [] }]],
    };
  if (kind === "chart") return { kind: "chart", field: "", chart: "bar" };
  if (STATIC_KINDS.includes(kind)) return { kind, text: "" } as Block;
  if (kind === "logo") return { kind: "logo" };
  if (kind === "divider") return { kind: "divider" };
  if (kind === "keyValue") return { kind: "keyValue", fields: [] };
  return { kind, field: "" } as Block; // heading/paragraph/list/table/matrix
}
