import { describe, expect, it } from "vitest";
import { getAtPath, updateAtPath, insertChild, removeAtPath } from "../ui/admin/layoutTree";
import type { Block } from "@proposal/shared";

// root stack → [ columns[ [stack[heading]], [stack[paragraph]] ] ]
const tree = (): Block => ({
  kind: "stack",
  children: [
    {
      kind: "columns",
      columns: [
        [{ kind: "stack", children: [{ kind: "heading", field: "title" }] }],
        [{ kind: "stack", children: [{ kind: "paragraph", field: "body" }] }],
      ],
    },
  ],
});

describe("layoutTree — columns traversal", () => {
  it("getAtPath descends columns via [col, block] then into the column's stack", () => {
    expect(getAtPath(tree(), [0])).toMatchObject({ kind: "columns" });
    expect(getAtPath(tree(), [0, 0, 0])).toMatchObject({ kind: "stack" }); // column 0's stack
    expect(getAtPath(tree(), [0, 1, 0, 0])).toMatchObject({ kind: "paragraph", field: "body" });
  });

  it("updateAtPath rewrites a block inside a column immutably", () => {
    const root = tree();
    const next = updateAtPath(root, [0, 0, 0, 0], (b) => ({ ...b, field: "subtitle" }) as Block);
    expect(getAtPath(next, [0, 0, 0, 0])).toMatchObject({ field: "subtitle" });
    expect(getAtPath(root, [0, 0, 0, 0])).toMatchObject({ field: "title" }); // original unchanged
  });

  it("insertChild appends to a column's nested stack", () => {
    const next = insertChild(tree(), [0, 0, 0], { kind: "divider" });
    expect(getAtPath(next, [0, 0, 0, 1])).toMatchObject({ kind: "divider" });
  });

  it("removeAtPath deletes a block inside a column", () => {
    const next = removeAtPath(tree(), [0, 0, 0, 0]);
    const stack = getAtPath(next, [0, 0, 0]) as { children: Block[] };
    expect(stack.children.length).toBe(0);
  });

  it("still handles pure stack paths (5a behaviour)", () => {
    const flat: Block = { kind: "stack", children: [{ kind: "heading", field: "h" }, { kind: "divider" }] };
    expect(getAtPath(flat, [1])).toMatchObject({ kind: "divider" });
  });
});
