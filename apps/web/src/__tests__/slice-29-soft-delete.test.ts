// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests } from "../server/repo";
import type { Repository } from "../server/repo/types";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { GET as listProposals, POST as createProposal } from "../../app/api/proposals/route";
import {
  GET as getProposal,
  PUT as saveProposal,
  DELETE as deleteProposal,
} from "../../app/api/proposals/[id]/route";
import { POST as restoreProposal } from "../../app/api/proposals/[id]/restore/route";
import { DELETE as purgeProposal } from "../../app/api/proposals/[id]/purge/route";

// ---------- repository contract (memory impl backs the suite + dev) ----------
describe("repository — soft-delete + trash (4a)", () => {
  let repo: Repository;
  beforeEach(() => {
    repo = createMemoryRepo();
  });

  it("soft-deletes: hidden from the active list, present in trash, still fetchable", async () => {
    const p = await repo.createProposal("o1", sampleProposal);
    expect(await repo.deleteProposal(p.id)).toBe(true);

    expect((await repo.listProposals("o1")).map((x) => x.id)).not.toContain(p.id);
    expect((await repo.listTrashedProposals("o1")).map((x) => x.id)).toContain(p.id);
    expect((await repo.getProposal(p.id))?.deletedAt).toBeTruthy();
  });

  it("restores from trash", async () => {
    const p = await repo.createProposal("o1", sampleProposal);
    await repo.deleteProposal(p.id);
    expect(await repo.restoreProposal(p.id)).toBe(true);

    expect((await repo.listProposals("o1")).map((x) => x.id)).toContain(p.id);
    expect(await repo.listTrashedProposals("o1")).toHaveLength(0);
    expect((await repo.getProposal(p.id))?.deletedAt).toBeNull();
  });

  it("purges permanently (hard delete incl. versions)", async () => {
    const p = await repo.createProposal("o1", sampleProposal);
    await repo.snapshotVersion(p.id);
    await repo.deleteProposal(p.id);
    expect(await repo.purgeProposal(p.id)).toBe(true);

    expect(await repo.getProposal(p.id)).toBeNull();
    expect(await repo.listVersions(p.id)).toHaveLength(0);
    expect(await repo.listTrashedProposals("o1")).toHaveLength(0);
  });

  it("does not duplicate a trashed proposal", async () => {
    const p = await repo.createProposal("o1", sampleProposal);
    await repo.deleteProposal(p.id);
    expect(await repo.duplicateProposal("o1", p.id)).toBeNull();
  });

  it("scopes the trash list by owner", async () => {
    const a = await repo.createProposal("o1", sampleProposal);
    const b = await repo.createProposal("o2", sampleProposal);
    await repo.deleteProposal(a.id);
    await repo.deleteProposal(b.id);
    expect((await repo.listTrashedProposals("o1")).map((x) => x.id)).toEqual([a.id]);
  });
});

// ---------- route behaviour ----------
describe("proposals routes — soft-delete + trash (4a)", () => {
  beforeEach(() => {
    setRepoForTests(createMemoryRepo());
    setOwnerResolverForTests(async () => "owner_local");
  });
  afterEach(() => {
    setRepoForTests(null);
    setOwnerResolverForTests(null);
  });

  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const req = (url: string, method: string, body?: unknown) =>
    new Request(url, {
      method,
      headers: { "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  async function createOne() {
    const res = await createProposal(req("http://x/api/proposals", "POST", sampleProposal));
    return ((await res.json()) as { proposal: { id: string } }).proposal;
  }
  const activeIds = async () =>
    (
      (await (await listProposals(req("http://x/api/proposals", "GET"))).json()) as {
        proposals: { id: string }[];
      }
    ).proposals.map((p) => p.id);
  const trashIds = async () =>
    (
      (await (await listProposals(req("http://x/api/proposals?trash=1", "GET"))).json()) as {
        proposals: { id: string }[];
      }
    ).proposals.map((p) => p.id);

  it("DELETE moves to trash; restore brings it back; the active list reflects both", async () => {
    const p = await createOne();
    expect(await activeIds()).toContain(p.id);

    expect((await deleteProposal(req("http://x", "DELETE"), ctx(p.id))).status).toBe(204);
    expect(await activeIds()).not.toContain(p.id);
    expect(await trashIds()).toContain(p.id);

    // a trashed proposal is invisible to the normal edit/read surface
    expect((await getProposal(req("http://x", "GET"), ctx(p.id))).status).toBe(404);
    expect((await saveProposal(req("http://x", "PUT", sampleProposal), ctx(p.id))).status).toBe(
      404,
    );

    expect((await restoreProposal(req("http://x", "POST"), ctx(p.id))).status).toBe(200);
    expect(await activeIds()).toContain(p.id);
    expect(await trashIds()).not.toContain(p.id);
  });

  it("restore/purge 404 a proposal that isn't in the trash", async () => {
    const p = await createOne(); // live, not trashed
    expect((await restoreProposal(req("http://x", "POST"), ctx(p.id))).status).toBe(404);
    expect((await purgeProposal(req("http://x", "DELETE"), ctx(p.id))).status).toBe(404);
  });

  it("purge permanently removes a trashed proposal", async () => {
    const p = await createOne();
    await deleteProposal(req("http://x", "DELETE"), ctx(p.id));
    expect((await purgeProposal(req("http://x", "DELETE"), ctx(p.id))).status).toBe(204);
    expect(await trashIds()).not.toContain(p.id);
    expect((await getProposal(req("http://x", "GET"), ctx(p.id))).status).toBe(404);
  });
});
