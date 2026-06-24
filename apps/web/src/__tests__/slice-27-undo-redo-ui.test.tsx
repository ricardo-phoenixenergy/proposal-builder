import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { UndoRedo } from "../ui/UndoRedo";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => {
  useProposalStore.setState({ document: sampleProposal, selectedId: null });
  useProposalStore.temporal.getState().clear();
});
afterEach(() => {
  cleanup();
  useProposalStore.temporal.getState().clear();
});

describe("UndoRedo controls", () => {
  it("disables Undo with no history, enables after an edit, and undoes on click", () => {
    render(<UndoRedo />);
    const undoBtn = screen.getByRole("button", { name: /undo/i });
    expect(undoBtn).toBeDisabled();

    act(() => {
      useProposalStore.getState().setBrief("edited");
    });
    expect(undoBtn).not.toBeDisabled();

    fireEvent.click(undoBtn);
    expect(useProposalStore.getState().document.brief ?? "").not.toBe("edited");
  });

  it("undoes on Ctrl+Z", () => {
    render(<UndoRedo />);
    act(() => {
      useProposalStore.getState().setBrief("kbd edit");
    });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(useProposalStore.getState().document.brief ?? "").not.toBe("kbd edit");
  });
});
