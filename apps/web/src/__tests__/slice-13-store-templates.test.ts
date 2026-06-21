// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builtInTemplates, type Template } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";

const authored: Template = {
  id: "tmpl_sales", name: "Sales", themeId: "theme_phoenix_default", locked: false,
  slots: [{ kind: "fixed", type: "text", lock: "open" }, { kind: "fixed", type: "executive_summary", lock: "open" }],
};

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  useProposalStore.setState({ templates: builtInTemplates });
});

describe("store templates", () => {
  it("initialises templates to the built-ins", () => {
    expect(useProposalStore.getState().templates.map((t) => t.id)).toEqual(builtInTemplates.map((t) => t.id));
  });

  it("loadTemplates hydrates from the API", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ templates: [...builtInTemplates, authored] }), { status: 200, headers: { "content-type": "application/json" } })),
    ));
    await useProposalStore.getState().loadTemplates();
    expect(useProposalStore.getState().templates.map((t) => t.id)).toContain("tmpl_sales");
  });

  it("applyTemplate scaffolds a document from a hydrated template", () => {
    useProposalStore.setState({ templates: [...builtInTemplates, authored] });
    useProposalStore.getState().applyTemplate("tmpl_sales");
    const doc = useProposalStore.getState().document;
    expect(doc.templateId).toBe("tmpl_sales");
    expect(doc.sections).toHaveLength(2);
  });
});
