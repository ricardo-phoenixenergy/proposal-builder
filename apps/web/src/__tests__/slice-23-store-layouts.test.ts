// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProposalStore } from "../state/proposalStore";
import { getLayout, resetLayoutsForTests, type SectionLayout } from "@proposal/shared";

const layout: SectionLayout = {
  type: "cover",
  variant: "cover",
  pageFormat: "a4_portrait",
  name: "Cover",
  root: { kind: "stack", children: [] },
  version: 1,
};

afterEach(() => {
  resetLayoutsForTests();
  vi.unstubAllGlobals();
});

describe("store loadLayouts", () => {
  it("fetches layouts and hydrates the shared registry + state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ layouts: [layout] }), { status: 200 })),
    );
    await useProposalStore.getState().loadLayouts();
    expect(useProposalStore.getState().layouts.length).toBe(1);
    expect(getLayout("cover", "cover", "a4_portrait")?.name).toBe("Cover");
  });
});
