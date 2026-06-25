// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { getRepo, setRepoForTests } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { GET as listShares, POST as createShare } from "../../app/api/proposals/[id]/shares/route";
import { DELETE as revokeShare } from "../../app/api/proposals/[id]/shares/[token]/route";

let actor = "user_a";

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  setOwnerResolverForTests(async () => actor);
  actor = "user_a";
});
afterEach(() => {
  setRepoForTests(null);
  setOwnerResolverForTests(null);
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const tokenCtx = (id: string, token: string) => ({ params: Promise.resolve({ id, token }) });
const req = (method: string, body?: unknown) =>
  new Request("http://x/api/proposals", {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

async function newProposal(owner: string): Promise<string> {
  actor = owner;
  const created = await (
    await import("../../app/api/proposals/route")
  ).POST(req("POST", sampleProposal));
  return ((await created.json()) as { proposal: { id: string } }).proposal.id;
}

describe("share-link routes (2b)", () => {
  it("creates a link (export on by default), lists it, then revokes it", async () => {
    const id = await newProposal("user_a");

    const created = await createShare(req("POST", {}), ctx(id));
    expect(created.status).toBe(201);
    const { link } = (await created.json()) as { link: { token: string; allowExport: boolean } };
    expect(link.allowExport).toBe(true);
    expect(link.token).toMatch(/^shr_/);

    const listed = await listShares(req("GET"), ctx(id));
    expect(((await listed.json()) as { links: unknown[] }).links).toHaveLength(1);

    const revoked = await revokeShare(req("DELETE"), tokenCtx(id, link.token));
    expect(revoked.status).toBe(200);
    expect((await getRepo().getShareLink(link.token))?.revokedAt).not.toBeNull();
  });

  it("honours allowExport=false and rejects a past expiry", async () => {
    const id = await newProposal("user_a");

    const offExport = await createShare(req("POST", { allowExport: false }), ctx(id));
    expect(((await offExport.json()) as { link: { allowExport: boolean } }).link.allowExport).toBe(
      false,
    );

    const pastExpiry = await createShare(
      req("POST", { expiresAt: "2000-01-01T00:00:00.000Z" }),
      ctx(id),
    );
    expect(pastExpiry.status).toBe(400);
  });

  it("a non-member cannot create or list links (404, no leak)", async () => {
    const id = await newProposal("user_a");
    actor = "user_b";
    expect((await createShare(req("POST", {}), ctx(id))).status).toBe(404);
    expect((await listShares(req("GET"), ctx(id))).status).toBe(404);
  });

  it("cannot revoke another proposal's token (404)", async () => {
    const idA = await newProposal("user_a");
    const idB = await newProposal("user_a");
    const created = await createShare(req("POST", {}), ctx(idA));
    const { link } = (await created.json()) as { link: { token: string } };
    // try to revoke A's token via proposal B's route
    expect((await revokeShare(req("DELETE"), tokenCtx(idB, link.token))).status).toBe(404);
  });

  it("double-revoke is a 409", async () => {
    const id = await newProposal("user_a");
    const { link } = (await (await createShare(req("POST", {}), ctx(id))).json()) as {
      link: { token: string };
    };
    expect((await revokeShare(req("DELETE"), tokenCtx(id, link.token))).status).toBe(200);
    expect((await revokeShare(req("DELETE"), tokenCtx(id, link.token))).status).toBe(409);
  });
});
