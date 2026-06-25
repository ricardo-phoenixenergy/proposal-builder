// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { personalWorkspaceId } from "../server/repo/workspaceId";
import { DELETE as deleteProposal } from "../../app/api/proposals/[id]/route";

describe("repository — audit_events (3a)", () => {
  beforeEach(() => setRepoForTests(createMemoryRepo()));
  afterEach(() => setRepoForTests(null));

  it("records and lists events scoped to a workspace, newest first", async () => {
    const repo = getRepo();
    await repo.recordAuditEvent({
      workspaceId: "ws_1",
      actorUserId: "u1",
      action: "proposal.trashed",
      targetType: "proposal",
      targetId: "p1",
    });
    await repo.recordAuditEvent({
      workspaceId: "ws_1",
      actorUserId: "u1",
      action: "proposal.exported",
      targetType: "proposal",
      targetId: "p1",
    });
    await repo.recordAuditEvent({
      workspaceId: "ws_2",
      actorUserId: "u2",
      action: "proposal.trashed",
    });

    const events = await repo.listAuditEvents("ws_1");
    expect(events.map((e) => e.action)).toEqual(["proposal.exported", "proposal.trashed"]);
    expect(events[0]!.actorUserId).toBe("u1");
    expect(await repo.listAuditEvents("ws_2")).toHaveLength(1);
  });
});

describe("audit wiring — proposal mutations (3a)", () => {
  beforeEach(() => {
    setRepoForTests(createMemoryRepo());
    setOwnerResolverForTests(async () => "owner_a");
  });
  afterEach(() => {
    setRepoForTests(null);
    setOwnerResolverForTests(null);
  });

  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("trashing a proposal records an audit event attributed to the actor + workspace", async () => {
    const repo = getRepo();
    const created = await (
      await import("../../app/api/proposals/route")
    ).POST(
      new Request("http://x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sampleProposal),
      }),
    );
    const { id } = ((await created.json()) as { proposal: { id: string } }).proposal;

    const res = await deleteProposal(new Request("http://x", { method: "DELETE" }), ctx(id));
    expect(res.status).toBe(204);

    const events = await repo.listAuditEvents(personalWorkspaceId("owner_a"));
    const trashed = events.find((e) => e.action === "proposal.trashed");
    expect(trashed).toBeTruthy();
    expect(trashed!.actorUserId).toBe("owner_a");
    expect(trashed!.targetId).toBe(id);
  });
});
