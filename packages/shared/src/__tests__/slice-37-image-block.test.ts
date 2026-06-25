import { describe, expect, it } from "vitest";
import { validateLayout } from "../validation/validateLayout";
import { LEAF_KINDS } from "../types/layout";
import type { SectionLayout } from "../types/layout";
import type { SectionTypeSchema } from "../types/section";

const coverType: SectionTypeSchema = {
  type: "cover",
  label: "Cover",
  category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "hero", type: "image", label: "Hero image" },
  ],
  variants: [],
  schemaVersion: 1,
};

const layout = (root: SectionLayout["root"]): SectionLayout => ({
  type: "cover",
  variant: "cover",
  pageFormat: "a4_portrait",
  name: "Cover",
  root,
  version: 1,
});

describe("foreground image block", () => {
  it("'image' is part of the leaf-block vocabulary", () => {
    expect(LEAF_KINDS).toContain("image");
  });

  it("accepts an image block bound to an image field", () => {
    const res = validateLayout(
      layout({ kind: "stack", children: [{ kind: "image", field: "hero" }] }),
      coverType,
    );
    expect(res.valid).toBe(true);
  });

  it("rejects an image block bound to a non-image field", () => {
    const res = validateLayout(
      layout({ kind: "stack", children: [{ kind: "image", field: "title" }] }),
      coverType,
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.path.endsWith("/field"))).toBe(true);
  });

  it("rejects an image block with no field", () => {
    const res = validateLayout(
      layout({ kind: "stack", children: [{ kind: "image" } as never] }),
      coverType,
    );
    expect(res.valid).toBe(false);
  });
});
