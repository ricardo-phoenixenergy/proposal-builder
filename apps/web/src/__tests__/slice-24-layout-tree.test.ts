import { describe, expect, it } from "vitest";
import { getAtPath, updateAtPath, insertChild, removeAtPath, moveAtPath } from "../ui/admin/layoutTree";
import type { Block } from "@proposal/shared";

const tree = (): Block => ({
  kind: "stack",
  children: [
    { kind: "heading", field: "title" },
    { kind: "stack", children: [{ kind: "paragraph", field: "body" }] },
  ],
});

describe("layoutTree", () => {
  it("getAtPath returns the block (or root for [])", () => {
    expect(getAtPath(tree(), [0])).toMatchObject({ kind: "heading" });
    expect(getAtPath(tree(), [1, 0])).toMatchObject({ kind: "paragraph" });
    expect(getAtPath(tree(), [])!.kind).toBe("stack");
    expect(getAtPath(tree(), [9])).toBeNull();
  });

  it("updateAtPath replaces immutably", () => {
    const root = tree();
    const next = updateAtPath(root, [0], (b) => ({ ...b, field: "subtitle" }) as Block);
    expect(getAtPath(next, [0])).toMatchObject({ field: "subtitle" });
    expect(getAtPath(root, [0])).toMatchObject({ field: "title" }); // original unchanged
  });

  it("insertChild appends to the stack at parentPath", () => {
    const next = insertChild(tree(), [], { kind: "divider" });
    expect((next as { children: Block[] }).children.length).toBe(3);
    const nested = insertChild(tree(), [1], { kind: "logo" });
    expect(getAtPath(nested, [1, 1])).toMatchObject({ kind: "logo" });
  });

  it("removeAtPath deletes a block", () => {
    const next = removeAtPath(tree(), [0]);
    expect((next as { children: Block[] }).children.length).toBe(1);
    expect(getAtPath(next, [0])!.kind).toBe("stack");
  });

  it("moveAtPath swaps with a sibling (clamped at the ends)", () => {
    const down = moveAtPath(tree(), [0], 1);
    expect((down as { children: Block[] }).children[0]!.kind).toBe("stack");
    expect((down as { children: Block[] }).children[1]!.kind).toBe("heading");
    const clamped = moveAtPath(tree(), [0], -1); // already first → unchanged order
    expect((clamped as { children: Block[] }).children[0]!.kind).toBe("heading");
  });
});
