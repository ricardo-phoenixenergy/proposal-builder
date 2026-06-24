// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { setSectionPageBreak } from "../state/mutations";
import { useProposalStore } from "../state/proposalStore";

const doc = {
  id: "p1",
  title: "T",
  client: { name: "C" },
  themeId: "theme_default",
  templateId: "open",
  sections: [{ id: "a", type: "text", data: {} }],
};

describe("setSectionPageBreak", () => {
  it("toggles the flag immutably", () => {
    const next = setSectionPageBreak(doc, "a", true);
    expect(next.sections[0]!.pageBreakBefore).toBe(true);
    expect(doc.sections[0]!).not.toHaveProperty("pageBreakBefore");
  });
});

describe("store setPageBreakBefore", () => {
  beforeEach(() =>
    useProposalStore.setState({
      document: { ...doc, sections: [{ id: "a", type: "text", data: {} }] },
      selectedId: "a",
    }),
  );
  it("sets the flag on the document", () => {
    useProposalStore.getState().setPageBreakBefore("a", true);
    expect(useProposalStore.getState().document.sections[0]!.pageBreakBefore).toBe(true);
  });
});
