// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { personalWorkspaceId } from "../server/repo/workspaceId";
import { roleAtLeast } from "../server/auth/roles";
import {
  GET as getProposal,
  PUT as saveProposal,
  DELETE as deleteProposal,
} from "../../app/api/proposals/[id]/route";

describe("roleAtLeast (RBAC hierarchy)", () => {
  it("orders viewer < editor < admin", () => {
    expect(roleAtLeast("admin", "editor")).toBe(true);
    expect(roleAtLeast("editor", "editor")).toBe(true);
    expect(roleAtLeast("viewer", "editor")).toBe(false);
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
    expect(roleAtLeast("editor", "admin")).toBe(false);
  });
});

describe("repository — workspace roles (2a)", () => {
  beforeEach(() => setRepoForTests(createMemoryRepo()));
  afterEach(() => setRepoForTests(null));

  it("getWorkspaceRole returns the member's role or null", async () => {
    const repo = getRepo();
    await repo.createProposal("owner_a", sampleProposal); // ensures owner_a admin of ws_owner_a
    await repo.addWorkspaceMember(personalWorkspaceId("owner_a"), "viewer_v", "viewer");
    expect(await repo.getWorkspaceRole(personalWorkspaceId("owner_a"), "owner_a")).toBe("admin");
    expect(await repo.getWorkspaceRole(personalWorkspaceId("owner_a"), "viewer_v")).toBe("viewer");
    expect(await repo.getWorkspaceRole(personalWorkspaceId("owner_a"), "stranger")).toBeNull();
  });
});

describe("proposal routes — role enforcement (2a)", () => {
  let actor = "owner_a";
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
    new Request("http://x", {
      method,
      headers: { "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  async function ownerCreates() {
    actor = "owner_a";
    const res = await (
      await import("../../app/api/proposals/route")
    ).POST(req("POST", sampleProposal));
    return ((await res.json()) as { proposal: { id: string } }).proposal.id;
  }

  it("a viewer can read but not mutate (200 / 403); a non-member gets 404", async () => {
    const id = await ownerCreates();
    await getRepo().addWorkspaceMember(personalWorkspaceId("owner_a"), "viewer_v", "viewer");

    actor = "viewer_v";
    expect((await getProposal(req("GET"), ctx(id))).status).toBe(200);
    expect((await saveProposal(req("PUT", sampleProposal), ctx(id))).status).toBe(403);
    expect((await deleteProposal(req("DELETE"), ctx(id))).status).toBe(403);

    actor = "stranger";
    expect((await getProposal(req("GET"), ctx(id))).status).toBe(404);
  });

  it("an editor can mutate", async () => {
    const id = await ownerCreates();
    await getRepo().addWorkspaceMember(personalWorkspaceId("owner_a"), "editor_e", "editor");

    actor = "editor_e";
    expect((await saveProposal(req("PUT", sampleProposal), ctx(id))).status).toBe(200);
  });
});
