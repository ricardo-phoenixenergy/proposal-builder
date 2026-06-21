// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import type { Repository } from "../server/repo/types";

let repo: Repository;
beforeEach(() => {
  repo = createMemoryRepo();
});

describe("repo folders (owner-scoped)", () => {
  it("creates, lists (own only), renames", async () => {
    const f = await repo.createFolder("owner_a", "Sales");
    await repo.createFolder("owner_b", "Theirs");
    expect((await repo.listFolders("owner_a")).map((x) => x.name)).toEqual(["Sales"]);
    expect((await repo.renameFolder("owner_a", f.id, "Renamed"))?.name).toBe("Renamed");
    expect(await repo.renameFolder("owner_b", f.id, "Hijack")).toBeNull(); // not owner
  });

  it("deleteFolder unfiles its proposals (folderId -> null), owner-scoped", async () => {
    const f = await repo.createFolder("owner_a", "Sales");
    const p = await repo.createProposal("owner_a", sampleProposal, f.id);
    expect(await repo.deleteFolder("owner_b", f.id)).toBe(false); // not owner
    expect(await repo.deleteFolder("owner_a", f.id)).toBe(true);
    expect((await repo.getProposal(p.id))?.folderId).toBeNull();
    expect(await repo.listFolders("owner_a")).toHaveLength(0);
  });
});
