// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => {
  useProposalStore.setState({
    document: {
      id: "p1",
      title: "T",
      client: { name: "C" },
      themeId: "theme_default",
      templateId: "open",
      sections: [],
    },
  });
});

describe("brief lives in the document", () => {
  it("setBrief writes document.brief", () => {
    useProposalStore.getState().setBrief("Solar for Acme");
    expect(useProposalStore.getState().document.brief).toBe("Solar for Acme");
  });
});
