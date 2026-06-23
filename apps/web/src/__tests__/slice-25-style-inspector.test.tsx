import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LayoutEditor } from "../ui/admin/LayoutEditor";
import { setActiveSectionTypes, resetSectionTypesForTests, type SectionTypeSchema } from "@proposal/shared";

const coverType: SectionTypeSchema = {
  type: "cover", label: "Cover", category: "text",
  fields: [{ key: "title", type: "text", label: "Title" }], variants: [], schemaVersion: 1,
};

beforeEach(() => {
  resetSectionTypesForTests();
  setActiveSectionTypes([coverType]);
});
afterEach(() => {
  cleanup();
  resetSectionTypesForTests();
  vi.unstubAllGlobals();
});

describe("LayoutEditor style inspector", () => {
  it("applies a token color + size to the selected block and reflects it in the preview", () => {
    render(<LayoutEditor type="cover" pageFormat="a4_portrait" mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /add heading/i }));
    fireEvent.click(screen.getByLabelText("select-0")); // select the heading

    // the style panel appears for the selected block
    fireEvent.change(screen.getByLabelText("style-size"), { target: { value: "xl" } });
    fireEvent.click(screen.getByLabelText("color-primary")); // color swatch

    fireEvent.change(screen.getByLabelText("bind-0"), { target: { value: "title" } });
    const heading = document.querySelector('[data-layout-preview] [data-block="heading"]') as HTMLElement;
    expect(heading.style.fontSize).toBe("1.9rem"); // size xl
    expect(heading.style.color).toBe("var(--c-primary)");
  });
});
