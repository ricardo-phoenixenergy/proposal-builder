import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { SectionPane } from "../ui/inspector/SectionPane";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => {
  useProposalStore.setState({
    document: sampleProposal,
    selectedId: sampleProposal.sections[0]!.id,
  });
});
afterEach(cleanup);

describe("SectionPane", () => {
  it("renders controls for the selected section", () => {
    render(<SectionPane />);
    // The first sample section is "text" type which has a "standard" variant —
    // the variant <select> has aria-label="Variant".
    expect(screen.getByLabelText(/variant/i)).toBeInTheDocument();
  });

  it("renders nothing when no section is selected", () => {
    useProposalStore.setState({ selectedId: null });
    const { container } = render(<SectionPane />);
    expect(container).toBeEmptyDOMElement();
  });
});
