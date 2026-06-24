import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { setActiveLayouts, resetLayoutsForTests, type SectionLayout } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";
import { Inspector } from "../ui/Inspector";
import { defaultTheme } from "../theme/defaultTheme";

const authored: SectionLayout = {
  type: "executive_summary",
  variant: "authored_slide",
  pageFormat: "widescreen_16_9",
  name: "Slide",
  root: { kind: "stack", children: [] },
  version: 1,
};

beforeEach(() => {
  resetLayoutsForTests();
  setActiveLayouts([authored]);
  useProposalStore.setState({
    document: {
      id: "p1",
      title: "T",
      client: { name: "C" },
      themeId: "theme_default",
      templateId: "open",
      sections: [{ id: "s1", type: "executive_summary", data: { heading: "H", body: "B" } }],
      brief: "",
      pageFormat: "widescreen_16_9",
    },
    theme: defaultTheme,
    selectedId: "s1",
    templates: useProposalStore.getState().templates,
  });
});
afterEach(() => {
  cleanup();
  resetLayoutsForTests();
  setActiveLayouts([]);
});

describe("Inspector variant picker", () => {
  it("offers authored variants for the document's format alongside code variants", () => {
    render(<Inspector />);
    const select = screen.getByLabelText("Variant") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("standard"); // code variant
    expect(values).toContain("authored_slide"); // authored, for widescreen_16_9
  });
});
