import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useProposalStore } from "../state/proposalStore";
import { Inspector } from "../ui/Inspector";
import { defaultTheme } from "../theme/defaultTheme";

beforeEach(() => {
  useProposalStore.setState({
    document: {
      id: "p1", title: "T", client: { name: "C" }, themeId: "theme_default", templateId: "open",
      sections: [{ id: "s1", type: "executive_summary", data: { heading: "H", body: "B" } }],
      brief: "",
    },
    theme: defaultTheme,
    selectedId: "s1",
    templates: useProposalStore.getState().templates,
  });
});
afterEach(() => cleanup());

describe("Inspector page-break toggle", () => {
  it("toggles section.pageBreakBefore", () => {
    render(<Inspector />);
    const box = screen.getByLabelText(/page break before this section/i);
    fireEvent.click(box);
    expect(useProposalStore.getState().document.sections[0]!.pageBreakBefore).toBe(true);
  });
});
