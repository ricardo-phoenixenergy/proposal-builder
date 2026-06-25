// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { personalWorkspaceId } from "../server/repo/workspaceId";
import type { Repository } from "../server/repo/types";
import { GET as listProposals } from "../../app/api/proposals/route";
import { GET as getProposal, DELETE as deleteProposal } from "../../app/api/proposals/[id]/route";

describe("repository — workspace-membership scoping (1b)", () => {
  let repo: Repository;
  beforeEach(() => {
    repo = createMemoryRepo();
  });

  it("scopes lists by the acting user's workspace membership, not just creation", async () => {
    const a = await repo.createProposal("user_a", sampleProposal);
    await repo.createProposal("user_b", sampleProposal);

    // user_a only sees their own workspace's proposals (write ensured membership).
    expect((await repo.listProposals("user_a")).map((p) => p.id)).toEqual([a.id]);
    expect((await repo.listProposals("user_b")).map((p) => p.id)).not.toContain(a.id);
  });

  it("isWorkspaceMember reflects membership", async () => {
    await repo.createProposal("user_a", sampleProposal);
    expect(await repo.isWorkspaceMember(personalWorkspaceId("user_a"), "user_a")).toBe(true);
    expect(await repo.isWorkspaceMember(personalWorkspaceId("user_a"), "user_b")).toBe(false);
  });
});

describe("proposal routes — cross-workspace isolation (1b)", () => {
  let actor = "user_a";
  beforeEach(() => {
    setRepoForTests(createMemoryRepo());
    setOwnerResolverForTests(async () => actor);
  });
  afterEach(() => {
    setRepoForTests(null);
    setOwnerResolverForTests(null);
  });

  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const req = (method: string, body?: unknown) =>
    new Request("http://x/api/proposals", {
      method,
      headers: { "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  it("a non-member cannot read, list, or delete another workspace's proposal (404)", async () => {
    actor = "user_a";
    const created = await (
      await import("../../app/api/proposals/route")
    ).POST(req("POST", sampleProposal));
    const { id } = ((await created.json()) as { proposal: { id: string } }).proposal;

    // switch to a different user — same instance, no shared workspace
    actor = "user_b";
    expect((await getProposal(req("GET"), ctx(id))).status).toBe(404);
    expect((await deleteProposal(req("DELETE"), ctx(id))).status).toBe(404);
    const list = (await (await listProposals(req("GET"))).json()) as {
      proposals: { id: string }[];
    };
    expect(list.proposals.map((p) => p.id)).not.toContain(id);

    // back to the owner — still accessible
    actor = "user_a";
    expect((await getProposal(req("GET"), ctx(id))).status).toBe(200);
  });
});
