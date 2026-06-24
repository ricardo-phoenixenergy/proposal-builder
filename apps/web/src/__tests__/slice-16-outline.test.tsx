import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useProposalStore } from "../state/proposalStore";
import { Outline } from "../ui/Outline";

beforeEach(() => {
  useProposalStore.setState({
    document: {
      id: "p1",
      title: "T",
      client: { name: "C" },
      themeId: "theme_default",
      templateId: "open",
      sections: [
        { id: "a", type: "text", data: {} },
        { id: "b", type: "text", data: {} },
      ],
    },
    selectedId: "a",
    templates: useProposalStore.getState().templates,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Outline add/delete", () => {
  it("deletes a section after confirm", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Outline />);
    const delButtons = screen.getAllByRole("button", { name: /delete section/i });
    fireEvent.click(delButtons[0]!);
    expect(useProposalStore.getState().document.sections.map((s) => s.id)).toEqual(["b"]);
  });

  it("does not delete when confirm is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Outline />);
    fireEvent.click(screen.getAllByRole("button", { name: /delete section/i })[0]!);
    expect(useProposalStore.getState().document.sections).toHaveLength(2);
  });

  it("inserts a section at a position via the insert control", () => {
    render(<Outline />);
    // The first in-between insert control inserts at index 1 (after the first section).
    const inserts = screen.getAllByLabelText(/insert section/i) as HTMLSelectElement[];
    fireEvent.change(inserts[1]!, { target: { value: "executive_summary" } });
    const sections = useProposalStore.getState().document.sections;
    expect(sections[1]!.type).toBe("executive_summary");
  });
});
