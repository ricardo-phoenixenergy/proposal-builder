// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => {
  const s = useProposalStore.getState();
  s.applyTemplate; // ensure store is created
  useProposalStore.setState({
    document: {
      id: "p1",
      title: "T",
      client: { name: "C" },
      themeId: "theme_default",
      templateId: "open",
      sections: [
        { id: "a", type: "text", data: {} },
        { id: "b", type: "text", data: {} },
      ],
    },
    selectedId: "a",
  });
});

describe("store insert/remove", () => {
  it("insertSection adds at the index and selects it", () => {
    useProposalStore.getState().insertSection("executive_summary", 1);
    const { document, selectedId } = useProposalStore.getState();
    expect(document.sections[1]!.type).toBe("executive_summary");
    expect(selectedId).toBe(document.sections[1]!.id);
  });

  it("removeSection drops it and clears selection if it was selected", () => {
    useProposalStore.getState().removeSection("a");
    const { document, selectedId } = useProposalStore.getState();
    expect(document.sections.map((s) => s.id)).toEqual(["b"]);
    expect(selectedId).toBeNull();
  });
});
