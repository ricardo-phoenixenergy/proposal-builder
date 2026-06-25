import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  setActiveSectionTypes,
  resetSectionTypesForTests,
  type SectionLayout,
  type SectionTypeSchema,
} from "@proposal/shared";
import { LayoutRenderer } from "../render/LayoutRenderer";
import { SectionRenderer } from "../render/SectionRenderer";
import { defaultTheme } from "../theme/defaultTheme";

const coverType: SectionTypeSchema = {
  type: "cover_page",
  label: "Cover page",
  category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "hero", type: "image", label: "Hero image" },
  ],
  variants: [],
  schemaVersion: 1,
};

beforeEach(() => {
  resetSectionTypesForTests();
  setActiveSectionTypes([coverType]);
});
afterEach(() => {
  cleanup();
  resetSectionTypesForTests();
});

const imageLayout: SectionLayout = {
  type: "cover_page",
  variant: "hero",
  pageFormat: "a4_portrait",
  name: "Hero",
  root: { kind: "stack", children: [{ kind: "image", field: "hero" }] },
  version: 1,
};

describe("foreground image block renders an <img>", () => {
  it("renders the bound field's URL as an image element", () => {
    const { container } = render(
      <LayoutRenderer
        layout={imageLayout}
        data={{ hero: "https://x.test/cover.png" }}
        theme={defaultTheme}
        pageFormat="a4_portrait"
      />,
    );
    const img = container.querySelector('img[data-block="image"]') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://x.test/cover.png");
  });

  it("renders nothing for the block when the field is empty (graceful)", () => {
    const { container } = render(
      <LayoutRenderer
        layout={imageLayout}
        data={{ hero: "" }}
        theme={defaultTheme}
        pageFormat="a4_portrait"
      />,
    );
    expect(container.querySelector('img[data-block="image"]')).toBeNull();
  });
});

describe("generic fallback renders image fields as images, not text", () => {
  it("shows an <img> for an image field when no layout is authored", () => {
    const { container } = render(
      <SectionRenderer
        section={{
          id: "s1",
          type: "cover_page",
          data: { title: "Acme", hero: "https://x.test/hero.jpg" },
        }}
        theme={defaultTheme}
      />,
    );
    // falls back (no authored layout / code component)
    expect(container.querySelector('[data-unstyled="true"]')).not.toBeNull();
    const img = container.querySelector("img") as HTMLImageElement | null;
    expect(img?.getAttribute("src")).toBe("https://x.test/hero.jpg");
    // the URL must NOT appear as raw text
    expect(container.textContent).not.toContain("https://x.test/hero.jpg");
  });
});
