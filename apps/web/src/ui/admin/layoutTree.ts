import type { Block } from "@proposal/shared";

/** A stack's children array, or null for a leaf / non-stack block. */
export function childrenOf(block: Block): Block[] | null {
  return block.kind === "stack" ? block.children : null;
}

/** The block at `path`; a stack consumes 1 index, a columns consumes 2 ([col, block]). null if invalid. */
export function getAtPath(root: Block, path: number[]): Block | null {
  let node: Block | null = root;
  let i = 0;
  while (i < path.length && node) {
    if (node.kind === "stack") {
      node = node.children[path[i]!] ?? null;
      i += 1;
    } else if (node.kind === "columns") {
      const col: Block[] | undefined = node.columns[path[i]!];
      node = (col ? col[path[i + 1]!] : undefined) ?? null;
      i += 2;
    } else {
      return null;
    }
  }
  return node;
}

/** Replace the block at `path` via `fn`, returning a new root. Traverses stack + columns. */
export function updateAtPath(root: Block, path: number[], fn: (b: Block) => Block): Block {
  if (path.length === 0) return fn(root);
  if (root.kind === "stack") {
    const [head, ...rest] = path;
    return {
      ...root,
      children: root.children.map((c, i) => (i === head ? updateAtPath(c, rest, fn) : c)),
    } as Block;
  }
  if (root.kind === "columns") {
    const [col, idx, ...rest] = path;
    return {
      ...root,
      columns: root.columns.map((column, ci) =>
        ci === col ? column.map((c, bi) => (bi === idx ? updateAtPath(c, rest, fn) : c)) : column,
      ),
    } as Block;
  }
  return root; // leaf with a non-empty path → no-op
}

/** Append `block` to the stack at `parentPath` ([] = root). No-op if the target is not a stack. */
export function insertChild(root: Block, parentPath: number[], block: Block): Block {
  return updateAtPath(root, parentPath, (parent) => {
    const kids = childrenOf(parent);
    if (!kids) return parent;
    return { ...parent, children: [...kids, block] } as Block;
  });
}

/** Remove the block at `path`. No-op for the root ([]). */
export function removeAtPath(root: Block, path: number[]): Block {
  if (path.length === 0) return root;
  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1]!;
  return updateAtPath(root, parentPath, (parent) => {
    const kids = childrenOf(parent);
    if (!kids) return parent;
    return { ...parent, children: kids.filter((_, i) => i !== idx) } as Block;
  });
}

/** Swap the block at `path` with its sibling in direction `dir` (-1 up / +1 down); clamped. */
export function moveAtPath(root: Block, path: number[], dir: -1 | 1): Block {
  if (path.length === 0) return root;
  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1]!;
  return updateAtPath(root, parentPath, (parent) => {
    const kids = childrenOf(parent);
    if (!kids) return parent;
    const j = idx + dir;
    if (j < 0 || j >= kids.length) return parent; // clamp at ends
    const next = [...kids];
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    return { ...parent, children: next } as Block;
  });
}
