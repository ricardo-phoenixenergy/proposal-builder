import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { builtInTemplates, sampleProposal, type Template } from "@proposal/shared";
import { Inspector } from "../ui/Inspector";
import { useProposalStore } from "../state/proposalStore";

afterEach(cleanup);

const active: Template = { id: "tmpl_active", name: "Active One", themeId: "theme_phoenix_default", locked: false, slots: [{ kind: "fixed", type: "text", lock: "open" }] };
const dead: Template = { id: "tmpl_dead", name: "Dead One", themeId: "theme_phoenix_default", locked: false, slots: [{ kind: "fixed", type: "text", lock: "open" }], deprecated: true };

describe("Inspector template picker", () => {
  it("lists store templates and hides deprecated ones (keeping the current)", () => {
    useProposalStore.setState({
      templates: [...builtInTemplates, active, dead],
      document: { ...sampleProposal, templateId: builtInTemplates[0]!.id },
    });
    render(<Inspector />);
    const select = screen.getByLabelText("Template") as HTMLSelectElement;
    const options = within(select).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain("tmpl_active");
    expect(options).not.toContain("tmpl_dead");
  });

  it("keeps the current template in the list even when deprecated", () => {
    useProposalStore.setState({
      templates: [...builtInTemplates, dead],
      document: { ...sampleProposal, templateId: "tmpl_dead" },
    });
    render(<Inspector />);
    const select = screen.getByLabelText("Template") as HTMLSelectElement;
    const options = within(select).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain("tmpl_dead");
  });
});
