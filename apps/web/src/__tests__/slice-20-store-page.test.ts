// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => {
  useProposalStore.setState({
    document: { id: "p1", title: "T", client: { name: "C" }, themeId: "theme_phoenix_default", templateId: "open", sections: [] },
  });
});

describe("store page settings", () => {
  it("setPageFormat writes document.pageFormat", () => {
    useProposalStore.getState().setPageFormat("widescreen_16_9");
    expect(useProposalStore.getState().document.pageFormat).toBe("widescreen_16_9");
  });

  it("setPageMode writes document.pageMode", () => {
    useProposalStore.getState().setPageMode("slides");
    expect(useProposalStore.getState().document.pageMode).toBe("slides");
  });
});
