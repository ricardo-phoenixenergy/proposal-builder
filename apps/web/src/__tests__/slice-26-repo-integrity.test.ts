// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";

beforeEach(() => setRepoForTests(createMemoryRepo()));
afterEach(() => setRepoForTests(null));

describe("repo integrity", () => {
  it("updateProposalMeta bumps updatedAt", async () => {
    const created = await getRepo().createProposal("o1", sampleProposal);
    const before = created.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const summary = await getRepo().updateProposalMeta(created.id, { title: "Renamed" });
    expect(summary).not.toBeNull();
    expect(summary!.updatedAt >= before).toBe(true);
    expect(new Date(summary!.updatedAt).getTime()).toBeGreaterThan(new Date(before).getTime());
  });

  it("snapshotVersion captures the current document", async () => {
    const created = await getRepo().createProposal("o1", sampleProposal);
    const ver = await getRepo().snapshotVersion(created.id);
    expect(ver).not.toBeNull();
    expect(ver!.document.id).toBe(created.id);
    expect(await getRepo().listVersions(created.id)).toHaveLength(1);
  });
});
