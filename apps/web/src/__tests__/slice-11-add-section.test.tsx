// apps/web/src/__tests__/slice-11-add-section.test.tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";
import { Outline } from "../ui/Outline";

afterEach(cleanup);

describe("Outline — add section", () => {
  it("appends a section of the picked type when structure is unlocked", () => {
    useProposalStore.setState({
      document: { ...sampleProposal, templateId: "tmpl_open" },
      selectedId: null,
    });
    const before = useProposalStore.getState().document.sections.length;

    render(<Outline />);
    // The new UI has one insert <select> per gap (aria-label "Insert section at N").
    // The LAST one (index === sections.length) appends at the end.
    const inserts = screen.getAllByLabelText(/insert section/i);
    const appendPicker = inserts[inserts.length - 1]!;
    fireEvent.change(appendPicker, { target: { value: "text" } });

    expect(useProposalStore.getState().document.sections).toHaveLength(before + 1);
    expect(useProposalStore.getState().document.sections.at(-1)!.type).toBe("text");
  });
});
