import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { Outline } from "../ui/Outline";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() =>
  useProposalStore.setState({
    document: sampleProposal,
    selectedId: sampleProposal.sections[0]!.id,
    templates: [],
  }),
);
afterEach(cleanup);

describe("Outline keyboard navigation", () => {
  it("ArrowDown selects the next section, ArrowUp the previous", () => {
    render(<Outline />);
    const ids = sampleProposal.sections.map((s) => s.id);
    const nav = screen.getByRole("navigation"); // the Outline container (match its real role/label)
    fireEvent.keyDown(nav, { key: "ArrowDown" });
    expect(useProposalStore.getState().selectedId).toBe(ids[1]);
    fireEvent.keyDown(nav, { key: "ArrowUp" });
    expect(useProposalStore.getState().selectedId).toBe(ids[0]);
  });

  it("clamps at the first section on ArrowUp", () => {
    render(<Outline />);
    const ids = sampleProposal.sections.map((s) => s.id);
    const nav = screen.getByRole("navigation");
    fireEvent.keyDown(nav, { key: "ArrowUp" });
    expect(useProposalStore.getState().selectedId).toBe(ids[0]);
  });
});
