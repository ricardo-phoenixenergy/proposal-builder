// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { POST as createProposal } from "../../app/api/proposals/route";
import { PATCH } from "../../app/api/proposals/[id]/route";

const post = (body: unknown) =>
  new Request("http://x/api/proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const patch = (id: string, body: unknown) => ({
  req: new Request(`http://x/api/proposals/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  ctx: { params: Promise.resolve({ id }) },
});

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  setOwnerResolverForTests(async () => "owner_a");
});
afterEach(() => {
  setRepoForTests(null);
  setOwnerResolverForTests(null);
});

describe("POST /api/proposals (folderId)", () => {
  it("creates in a folder", async () => {
    const f = await getRepo().createFolder("owner_a", "Sales");
    const res = await createProposal(post({ document: sampleProposal, folderId: f.id }));
    expect(res.status).toBe(201);
    expect((await getRepo().listProposals("owner_a"))[0]!.folderId).toBe(f.id);
  });
});

describe("PATCH /api/proposals/[id]", () => {
  it("renames and moves into an owned folder", async () => {
    const f = await getRepo().createFolder("owner_a", "Sales");
    const c = await getRepo().createProposal("owner_a", sampleProposal);
    const r1 = patch(c.id, { title: "Renamed" });
    expect((await PATCH(r1.req, r1.ctx)).status).toBe(200);
    const r2 = patch(c.id, { folderId: f.id });
    expect(((await (await PATCH(r2.req, r2.ctx)).json()) as { proposal: { folderId: string } }).proposal.folderId).toBe(f.id);
  });

  it("400s an empty patch and a foreign folder", async () => {
    const c = await getRepo().createProposal("owner_a", sampleProposal);
    const empty = patch(c.id, {});
    expect((await PATCH(empty.req, empty.ctx)).status).toBe(400);
    const foreign = patch(c.id, { folderId: "fld_not_mine" });
    expect((await PATCH(foreign.req, foreign.ctx)).status).toBe(400);
  });

  it("404s another owner's proposal", async () => {
    const c = await getRepo().createProposal("owner_b", sampleProposal);
    const r = patch(c.id, { title: "x" });
    expect((await PATCH(r.req, r.ctx)).status).toBe(404);
  });
});
