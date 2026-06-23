import type { Block } from "@proposal/shared";

/** A stack's children array, or null for a leaf / non-stack block. */
export function childrenOf(block: Block): Block[] | null {
  return block.kind === "stack" ? block.children : null;
}

/** The block at `path` (indices into successive stack children); [] → root; null if invalid. */
export function getAtPath(root: Block, path: number[]): Block | null {
  let node: Block = root;
  for (const i of path) {
    const kids = childrenOf(node);
    if (!kids) return null;
    const nextNode = kids[i];
    if (!nextNode) return null;
    node = nextNode;
  }
  return node;
}

/** Replace the block at `path` via `fn`, returning a new root (structural sharing elsewhere). */
export function updateAtPath(root: Block, path: number[], fn: (b: Block) => Block): Block {
  if (path.length === 0) return fn(root);
  const kids = childrenOf(root);
  if (!kids) return root;
  const [head, ...rest] = path;
  return {
    ...root,
    children: kids.map((child, i) => (i === head ? updateAtPath(child, rest, fn) : child)),
  } as Block;
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
