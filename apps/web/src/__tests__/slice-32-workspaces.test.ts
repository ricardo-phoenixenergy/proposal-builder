// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { personalWorkspaceId } from "../server/repo/workspaceId";
import type { Repository } from "../server/repo/types";

let repo: Repository;
beforeEach(() => {
  repo = createMemoryRepo();
});

describe("workspaces — 1a (dark/additive)", () => {
  it("creates a personal workspace + admin membership for a new user", async () => {
    const user = await repo.createUser({ email: "a@x.com", passwordHash: "h" });
    const memberships = await repo.listUserWorkspaces(user.id);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]!.role).toBe("admin");
    expect(memberships[0]!.workspace.id).toBe(personalWorkspaceId(user.id));
  });

  it("stamps new proposals with the owner's personal workspace", async () => {
    const user = await repo.createUser({ email: "b@x.com", passwordHash: "h" });
    const p = await repo.createProposal(user.id, sampleProposal);
    expect(p.workspaceId).toBe(personalWorkspaceId(user.id));
    // reads are still owner-scoped in 1a — workspace_id is shadow data.
    expect((await repo.listProposals(user.id)).map((x) => x.id)).toContain(p.id);
  });

  it("stamps duplicated proposals with a workspace too", async () => {
    const user = await repo.createUser({ email: "c@x.com", passwordHash: "h" });
    const p = await repo.createProposal(user.id, sampleProposal);
    const dup = await repo.duplicateProposal(user.id, p.id);
    expect(dup?.workspaceId).toBe(personalWorkspaceId(user.id));
  });
});
