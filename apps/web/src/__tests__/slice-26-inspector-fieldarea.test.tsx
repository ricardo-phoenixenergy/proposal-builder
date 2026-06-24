"use client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  getSectionType,
  openTemplate,
  sampleProposal,
  type Section,
  type SectionTypeSchema,
  type Template,
} from "@proposal/shared";
import { FieldArea } from "../ui/inspector/FieldArea";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => useProposalStore.setState({ document: sampleProposal }));
afterEach(cleanup);

describe("FieldArea", () => {
  it("renders an editor for each field of the section's type", () => {
    const section = sampleProposal.sections[0]! as Section;
    const typeSchema = getSectionType(section.type) as SectionTypeSchema;
    const template = openTemplate as Template;

    render(
      <FieldArea
        section={section}
        selectedIndex={0}
        typeSchema={typeSchema}
        template={template}
        busy={false}
        fieldInstr={{}}
        setFieldInstr={vi.fn()}
        setField={vi.fn()}
        rewriteField={vi.fn()}
      />,
    );

    // The "text" section type has two ai-kind fields: heading (input) and body (textarea).
    // Both render with aria-label="field-<key>" — at least one textbox must appear.
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
  });

  it("renders field editors with correct aria-labels", () => {
    const section = sampleProposal.sections[0]! as Section;
    const typeSchema = getSectionType(section.type) as SectionTypeSchema;
    const template = openTemplate as Template;

    render(
      <FieldArea
        section={section}
        selectedIndex={0}
        typeSchema={typeSchema}
        template={template}
        busy={false}
        fieldInstr={{}}
        setFieldInstr={vi.fn()}
        setField={vi.fn()}
        rewriteField={vi.fn()}
      />,
    );

    // heading is type "text" → renders as <input aria-label="field-heading">
    expect(screen.getByLabelText("field-heading")).toBeInTheDocument();
    // body is type "paragraph" → renders as <textarea aria-label="field-body">
    expect(screen.getByLabelText("field-body")).toBeInTheDocument();
  });

  it("shows instruction input and Rewrite field button for ai-kind fields", () => {
    const section = sampleProposal.sections[0]! as Section;
    const typeSchema = getSectionType(section.type) as SectionTypeSchema;
    const template = openTemplate as Template;

    render(
      <FieldArea
        section={section}
        selectedIndex={0}
        typeSchema={typeSchema}
        template={template}
        busy={false}
        fieldInstr={{}}
        setFieldInstr={vi.fn()}
        setField={vi.fn()}
        rewriteField={vi.fn()}
      />,
    );

    // Each unlocked ai field renders an instruction input + Rewrite field button
    expect(screen.getByLabelText("instruction-heading")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /rewrite field/i }).length).toBeGreaterThan(0);
  });

  it("disables Rewrite field button when busy=true", () => {
    const section = sampleProposal.sections[0]! as Section;
    const typeSchema = getSectionType(section.type) as SectionTypeSchema;
    const template = openTemplate as Template;

    render(
      <FieldArea
        section={section}
        selectedIndex={0}
        typeSchema={typeSchema}
        template={template}
        busy={true}
        fieldInstr={{}}
        setFieldInstr={vi.fn()}
        setField={vi.fn()}
        rewriteField={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: /rewrite field/i });
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });
});
