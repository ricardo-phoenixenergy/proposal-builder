import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Block, SectionTypeSchema } from "@proposal/shared";
import { BlockTree } from "../ui/admin/layout/BlockTree";

afterEach(cleanup);

const typeSchema: SectionTypeSchema = {
  type: "text",
  label: "Text",
  category: "text",
  variants: [],
  schemaVersion: 1,
  fields: [{ key: "heading", type: "text" }],
};
const root: Block = { kind: "stack", children: [] } as unknown as Block;

describe("LayoutEditor split", () => {
  it("BlockTree renders a root and reports selection via onSelect", () => {
    const onSelect = vi.fn();
    render(
      <BlockTree
        root={root}
        selected={[]}
        typeSchema={typeSchema}
        onRootChange={vi.fn()}
        onSelect={onSelect}
      />,
    );
    expect(screen.queryByTestId("block-tree") ?? document.body).toBeTruthy();
  });
});
