// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import type { Repository } from "../server/repo/types";

let repo: Repository;
beforeEach(() => {
  repo = createMemoryRepo();
});

describe("repo proposals — summary, folder, rename/move/duplicate", () => {
  it("summary carries client + folderId", async () => {
    const created = await repo.createProposal("owner_a", sampleProposal, "fld_1");
    const [s] = await repo.listProposals("owner_a");
    expect(s).toMatchObject({ id: created.id, title: sampleProposal.title, client: sampleProposal.client.name, folderId: "fld_1" });
  });

  it("createProposal defaults folderId to null", async () => {
    const created = await repo.createProposal("owner_a", sampleProposal);
    expect(created.folderId).toBeNull();
  });

  it("updateProposalMeta renames (title) and moves (folderId)", async () => {
    const c = await repo.createProposal("owner_a", sampleProposal);
    expect((await repo.updateProposalMeta(c.id, { title: "Renamed" }))?.title).toBe("Renamed");
    expect((await repo.updateProposalMeta(c.id, { folderId: "fld_x" }))?.folderId).toBe("fld_x");
    expect((await repo.getProposal(c.id))?.document.title).toBe("Renamed");
    expect(await repo.updateProposalMeta("nope", { title: "x" })).toBeNull();
  });

  it("duplicateProposal clones as 'Copy of', keeps folder, new id, owner-scoped", async () => {
    const c = await repo.createProposal("owner_a", sampleProposal, "fld_1");
    const dup = await repo.duplicateProposal("owner_a", c.id);
    expect(dup!.id).not.toBe(c.id);
    expect(dup!.document.title).toBe(`Copy of ${sampleProposal.title}`);
    expect(dup!.folderId).toBe("fld_1");
    expect(await repo.duplicateProposal("owner_b", c.id)).toBeNull(); // not owner
  });
});
