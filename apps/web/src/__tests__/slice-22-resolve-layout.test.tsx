import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { resolveSection, availableVariants, defaultRegistry } from "../registry/componentRegistry";
import { setActiveLayouts, resetLayoutsForTests } from "@proposal/shared";
import type { Section, SectionLayout } from "@proposal/shared";
import { defaultTheme } from "../theme/defaultTheme";

const authored: SectionLayout = {
  type: "text", variant: "standard", pageFormat: "widescreen_16_9", name: "Slide",
  root: { kind: "stack", children: [{ kind: "heading", field: "heading" }] }, version: 1,
};

afterEach(() => {
  cleanup();
  resetLayoutsForTests();
});

describe("format-aware resolveSection", () => {
  const section: Section = { id: "s1", type: "text", variant: "standard", data: { heading: "Hello" } };

  it("prefers an authored layout for the document format over the code component", () => {
    setActiveLayouts([authored]);
    const { Component, unstyled, variant } = resolveSection(section, defaultRegistry, "widescreen_16_9");
    expect(unstyled).toBe(false);
    expect(variant).toBe("standard");
    const { container } = render(<Component data={section.data} theme={defaultTheme} />);
    expect(container.querySelector('[data-block="heading"]')!.textContent).toBe("Hello");
  });

  it("falls back to the code component when no authored layout matches the format", () => {
    setActiveLayouts([authored]); // only exists for widescreen_16_9
    const resolved = resolveSection(section, defaultRegistry, "a4_portrait");
    expect(resolved.unstyled).toBe(false);
    // the code component is TextSection, not the LayoutRenderer wrapper
    const { container } = render(<resolved.Component data={section.data} theme={defaultTheme} />);
    expect(container.querySelector('[data-block="heading"]')).toBeNull();
  });

  it("availableVariants = code variants ∪ authored variants for the format", () => {
    setActiveLayouts([{ ...authored, variant: "slide_only" }]);
    const variants = availableVariants("text", "widescreen_16_9");
    expect(variants).toContain("standard"); // code
    expect(variants).toContain("slide_only"); // authored
  });
});
