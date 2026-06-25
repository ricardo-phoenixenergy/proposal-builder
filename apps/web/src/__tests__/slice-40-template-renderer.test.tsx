// apps/web/src/__tests__/slice-40-template-renderer.test.tsx
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  setActiveSectionTypes,
  resetSectionTypesForTests,
  setActiveLayouts,
  resetLayoutsForTests,
  type SectionLayout,
  type SectionTypeSchema,
} from "@proposal/shared";
import { resolveSection } from "../registry/componentRegistry";
import { defaultTheme } from "../theme/defaultTheme";

const type: SectionTypeSchema = {
  type: "cover_page",
  label: "Cover",
  category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "hero", type: "image", label: "Hero" },
  ],
  variants: [],
  schemaVersion: 1,
};
const layout: SectionLayout = {
  type: "cover_page",
  variant: "hero",
  pageFormat: "a4_portrait",
  name: "Hero",
  version: 1,
  template:
    '<section class="cover"><img src="{{hero}}"/><h1>{{title}}</h1><script>alert(1)</script></section>',
  css: ".cover h1{color:var(--c-primary)}",
};

beforeEach(() => {
  resetSectionTypesForTests();
  resetLayoutsForTests();
  setActiveSectionTypes([type]);
  setActiveLayouts([layout]);
});
afterEach(() => {
  cleanup();
  resetSectionTypesForTests();
  resetLayoutsForTests();
});

describe("template layout rendering", () => {
  it("resolves a template layout and renders sanitized, data-bound HTML", () => {
    const { Component, unstyled, variant } = resolveSection(
      { id: "s1", type: "cover_page", data: { title: "Acme", hero: "https://x/y.png" } },
      undefined,
      "a4_portrait",
    );
    expect(unstyled).toBe(false);
    expect(variant).toBe("hero");
    const { container } = render(
      <Component data={{ title: "Acme", hero: "https://x/y.png" }} theme={defaultTheme} />,
    );
    expect(container.querySelector("h1")?.textContent).toBe("Acme");
    expect(container.querySelector('img[src="https://x/y.png"]')).not.toBeNull();
    expect(container.querySelector("script")).toBeNull(); // sanitized
    expect(container.querySelector('[data-layout="cover_page:hero"]')).not.toBeNull();
  });

  // Robustness: an already-saved layout with malformed CSS must NOT crash the render
  // (this is the prod crash — postcss CssSyntaxError propagated out of the server render).
  it("renders the HTML and drops the CSS when authored CSS is malformed (no throw)", () => {
    resetLayoutsForTests();
    setActiveLayouts([{ ...layout, css: ".cover h1{color:red" /* unclosed */ }]);
    const { Component } = resolveSection(
      { id: "s2", type: "cover_page", data: { title: "Acme", hero: "https://x/y.png" } },
      undefined,
      "a4_portrait",
    );
    let container!: HTMLElement;
    expect(() => {
      container = render(
        <Component data={{ title: "Acme", hero: "https://x/y.png" }} theme={defaultTheme} />,
      ).container;
    }).not.toThrow();
    // Content still renders; the broken stylesheet is simply omitted.
    expect(container.querySelector("h1")?.textContent).toBe("Acme");
    expect(container.querySelector("style")).toBeNull();
  });
});
