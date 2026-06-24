// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => useProposalStore.setState({ document: sampleProposal, selectedId: null }));
afterEach(() => useProposalStore.temporal.getState().clear());

describe("moveSection", () => {
  it("moves a section down and back up, preserving ids", () => {
    const ids = () => useProposalStore.getState().document.sections.map((s) => s.id);
    const before = ids();
    expect(before.length).toBeGreaterThanOrEqual(2);

    useProposalStore.getState().moveSection(before[0]!, 1); // move first down
    expect(ids()).toEqual([before[1], before[0], ...before.slice(2)]);

    useProposalStore.getState().moveSection(before[0]!, -1); // move it back up
    expect(ids()).toEqual(before);
  });

  it("is a no-op at the boundaries", () => {
    const ids = () => useProposalStore.getState().document.sections.map((s) => s.id);
    const before = ids();
    useProposalStore.getState().moveSection(before[0]!, -1); // first up = no-op
    expect(ids()).toEqual(before);
    useProposalStore.getState().moveSection(before[before.length - 1]!, 1); // last down = no-op
    expect(ids()).toEqual(before);
  });
});
