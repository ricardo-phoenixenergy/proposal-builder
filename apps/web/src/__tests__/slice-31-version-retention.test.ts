// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { versionCap } from "../server/repo/retention";
import type { Repository } from "../server/repo/types";

afterEach(() => {
  delete process.env.PROPOSAL_VERSION_CAP;
});

describe("versionCap()", () => {
  it("defaults to 20 and honours a positive PROPOSAL_VERSION_CAP override", () => {
    delete process.env.PROPOSAL_VERSION_CAP;
    expect(versionCap()).toBe(20);
    process.env.PROPOSAL_VERSION_CAP = "5";
    expect(versionCap()).toBe(5);
    process.env.PROPOSAL_VERSION_CAP = "nonsense";
    expect(versionCap()).toBe(20); // invalid → default
  });
});

describe("snapshotVersion retention (4c)", () => {
  let repo: Repository;
  beforeEach(() => {
    process.env.PROPOSAL_VERSION_CAP = "3";
    repo = createMemoryRepo();
  });

  it("keeps only the most recent N versions, pruning the oldest", async () => {
    const p = await repo.createProposal("o1", sampleProposal);
    for (let i = 1; i <= 5; i++) {
      await repo.saveProposal(p.id, { ...sampleProposal, title: `v${i}` });
      await repo.snapshotVersion(p.id);
    }
    const versions = await repo.listVersions(p.id);
    expect(versions).toHaveLength(3);
    // listVersions is newest-first; the three newest survive, v1/v2 are pruned.
    expect(versions.map((v) => v.document.title)).toEqual(["v5", "v4", "v3"]);
  });

  it("does not prune when under the cap", async () => {
    const p = await repo.createProposal("o1", sampleProposal);
    await repo.snapshotVersion(p.id);
    await repo.snapshotVersion(p.id);
    expect(await repo.listVersions(p.id)).toHaveLength(2);
  });
});
