"use client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  openTemplate,
  sampleProposal,
  getSectionType,
  type Section,
  type SectionTypeSchema,
  type Template,
} from "@proposal/shared";
import { FieldArea } from "../ui/inspector/FieldArea";
import { useProposalStore } from "../state/proposalStore";

afterEach(cleanup);

describe("FieldArea per-field busy", () => {
  it("disables only the in-flight field's Rewrite button", () => {
    useProposalStore.setState({ document: sampleProposal });
    const section = sampleProposal.sections[0]! as Section;
    const typeSchema = getSectionType(section.type) as SectionTypeSchema;
    const template = openTemplate as Template;

    // Get the first ai-kind field key from the section's type schema
    const aiFields = typeSchema.fields.filter(
      (f) => f.type === "text" || f.type === "paragraph" || f.type === "list",
    );
    const firstKey = aiFields[0]!.key;

    render(
      <FieldArea
        section={section}
        selectedIndex={0}
        typeSchema={typeSchema}
        template={template}
        busyFields={new Set([firstKey])}
        fieldInstr={{}}
        setFieldInstr={vi.fn()}
        setField={vi.fn()}
        rewriteField={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: /rewrite field/i });
    // The first field's Rewrite button must be disabled (it's in busyFields)
    expect(buttons[0]).toBeDisabled();
    // At least one other button must be enabled
    expect(buttons.length).toBeGreaterThan(1);
    expect(buttons[1]).not.toBeDisabled();
  });
});
