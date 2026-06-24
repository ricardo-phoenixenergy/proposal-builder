// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { POST } from "../../app/api/proposals/[id]/duplicate/route";

const call = (id: string) => ({
  req: new Request(`http://x/api/proposals/${id}/duplicate`, { method: "POST" }),
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

describe("POST /api/proposals/[id]/duplicate", () => {
  it("duplicates an owned proposal (201)", async () => {
    const c = await getRepo().createProposal("owner_a", sampleProposal);
    const { req, ctx } = call(c.id);
    const res = await POST(req, ctx);
    expect(res.status).toBe(201);
    expect(await getRepo().listProposals("owner_a")).toHaveLength(2);
  });

  it("404s another owner's proposal", async () => {
    const c = await getRepo().createProposal("owner_b", sampleProposal);
    const { req, ctx } = call(c.id);
    expect((await POST(req, ctx)).status).toBe(404);
  });
});
