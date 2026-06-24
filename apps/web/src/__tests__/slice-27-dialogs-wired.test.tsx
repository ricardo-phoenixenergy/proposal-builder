import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { Outline } from "../ui/Outline";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() =>
  useProposalStore.setState({ document: sampleProposal, selectedId: null, templates: [] }),
);
afterEach(cleanup);

describe("Outline delete via modal (no window.confirm)", () => {
  it("opens a ConfirmDialog and deletes only after confirming", () => {
    render(<Outline />);
    const before = useProposalStore.getState().document.sections.length;
    const firstRow = screen.getAllByLabelText("Delete section")[0]!;
    fireEvent.click(firstRow);
    // dialog appears; nothing deleted yet
    expect(useProposalStore.getState().document.sections.length).toBe(before);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /confirm|delete/i }));
    expect(useProposalStore.getState().document.sections.length).toBe(before - 1);
  });
});
