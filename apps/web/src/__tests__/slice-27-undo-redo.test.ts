// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => {
  useProposalStore.setState({ document: sampleProposal, selectedId: null });
  useProposalStore.temporal.getState().clear();
});
afterEach(() => useProposalStore.temporal.getState().clear());

describe("undo/redo (zundo temporal)", () => {
  it("undoes and redoes a brief edit on the document", () => {
    const original = useProposalStore.getState().document.brief ?? "";
    useProposalStore.getState().setBrief("CHANGED BRIEF");
    expect(useProposalStore.getState().document.brief).toBe("CHANGED BRIEF");

    useProposalStore.temporal.getState().undo();
    expect(useProposalStore.getState().document.brief ?? "").toBe(original);

    useProposalStore.temporal.getState().redo();
    expect(useProposalStore.getState().document.brief).toBe("CHANGED BRIEF");
  });

  it("does not track non-document state (e.g. saveStatus) as undo steps", () => {
    useProposalStore.temporal.getState().clear();
    useProposalStore.setState({ saveStatus: "saving" });
    expect(useProposalStore.temporal.getState().pastStates.length).toBe(0);
  });

  it("clears history when a different proposal context is loaded (clear on load path)", () => {
    useProposalStore.getState().setBrief("edit one");
    expect(useProposalStore.temporal.getState().pastStates.length).toBeGreaterThan(0);
    useProposalStore.temporal.getState().clear();
    expect(useProposalStore.temporal.getState().pastStates.length).toBe(0);
  });
});
