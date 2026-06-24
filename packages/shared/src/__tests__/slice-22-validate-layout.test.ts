import { describe, expect, it } from "vitest";
import { validateLayout } from "../validation/validateLayout";
import type { SectionLayout } from "../types/layout";
import type { SectionTypeSchema } from "../types/section";

const coverType: SectionTypeSchema = {
  type: "cover",
  label: "Cover",
  category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "subtitle", type: "paragraph", label: "Subtitle" },
    { key: "bullets", type: "list", label: "Bullets" },
    { key: "metrics", type: "dataset", label: "Metrics" },
    { key: "compare", type: "matrix", label: "Compare" },
    { key: "cover_image", type: "image", label: "Cover image" },
  ],
  variants: [],
  schemaVersion: 1,
};

const layout = (root: SectionLayout["root"]): SectionLayout => ({
  type: "cover",
  variant: "cover",
  pageFormat: "widescreen_16_9",
  name: "Cover",
  root,
  version: 1,
});

describe("validateLayout", () => {
  it("accepts a valid token-styled tree with kind-correct bindings", () => {
    const res = validateLayout(
      layout({
        kind: "stack",
        gap: "md",
        children: [
          {
            kind: "heading",
            field: "title",
            style: { color: "primary", size: "xl", align: "center" },
          },
          { kind: "paragraph", field: "subtitle" },
          { kind: "list", field: "bullets" },
          { kind: "keyValue", fields: ["title"] },
          { kind: "table", field: "metrics" },
          { kind: "chart", field: "metrics", chart: "bar" },
          { kind: "matrix", field: "compare" },
          { kind: "logo" },
          { kind: "divider" },
          { kind: "callout", text: "Static note" },
        ],
      }),
      coverType,
    );
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("rejects an unknown block kind", () => {
    const res = validateLayout(
      layout({ kind: "stack", children: [{ kind: "marquee" } as never] }),
      coverType,
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.path === "/root/children/0/kind")).toBe(true);
  });

  it("rejects a heading bound to a dataset field (kind mismatch)", () => {
    const res = validateLayout(
      layout({ kind: "stack", children: [{ kind: "heading", field: "metrics" }] }),
      coverType,
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.path === "/root/children/0/field")).toBe(true);
  });

  it("rejects a binding to a nonexistent field", () => {
    const res = validateLayout(
      layout({ kind: "stack", children: [{ kind: "heading", field: "nope" }] }),
      coverType,
    );
    expect(res.valid).toBe(false);
  });

  it("rejects an off-vocabulary style token", () => {
    const res = validateLayout(
      layout({
        kind: "stack",
        children: [{ kind: "heading", field: "title", style: { color: "brandRed" as never } }],
      }),
      coverType,
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.path.endsWith("/style/color"))).toBe(true);
  });

  it("requires static text on callout/text", () => {
    const res = validateLayout(
      layout({ kind: "stack", children: [{ kind: "callout", text: "" }] }),
      coverType,
    );
    expect(res.valid).toBe(false);
  });

  it("enforces 2–4 columns and matching widths", () => {
    const oneCol = validateLayout(layout({ kind: "columns", columns: [[]] }), coverType);
    expect(oneCol.valid).toBe(false);
    const badWidths = validateLayout(
      layout({ kind: "columns", widths: [1], columns: [[], []] }),
      coverType,
    );
    expect(badWidths.valid).toBe(false);
  });

  it("enforces a max nesting depth of 4", () => {
    let node: SectionLayout["root"] = { kind: "heading", field: "title" };
    for (let i = 0; i < 5; i++) node = { kind: "stack", children: [node] };
    const res = validateLayout(layout(node), coverType);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => /depth/i.test(e.message))).toBe(true);
  });

  it("validates a background: image-field binding kind, overlay opacity, position, minHeight", () => {
    const ok = validateLayout(
      layout({
        kind: "stack",
        background: {
          image: { field: "cover_image" },
          overlay: { color: "primary", opacity: 50 },
          position: "cover",
          minHeight: "page",
        },
        children: [{ kind: "heading", field: "title" }],
      }),
      coverType,
    );
    expect(ok.valid).toBe(true);

    const badField = validateLayout(
      layout({ kind: "stack", background: { image: { field: "title" } }, children: [] }),
      coverType,
    );
    expect(badField.valid).toBe(false); // title is text, not image

    const badOpacity = validateLayout(
      layout({
        kind: "stack",
        background: { overlay: { color: "primary", opacity: 150 } },
        children: [],
      }),
      coverType,
    );
    expect(badOpacity.valid).toBe(false);
  });
});
