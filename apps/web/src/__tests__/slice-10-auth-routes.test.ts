// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleProposal } from "@proposal/shared";

vi.mock("../server/pdf/renderProposalPdf", () => ({
  renderUrlToPdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])),
}));

import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { GET as listProposals, POST as createProposal } from "../../app/api/proposals/route";
import { GET as getProposal, PUT as saveProposal, DELETE as deleteProposal } from "../../app/api/proposals/[id]/route";
import { POST as exportPdf } from "../../app/api/proposals/[id]/export/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (method: string, body?: unknown) =>
  new Request("http://x/api/proposals", {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

let owner: string | null = "owner_a";
beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  owner = "owner_a";
  setOwnerResolverForTests(async () => owner);
});
afterEach(() => {
  setRepoForTests(null);
  setOwnerResolverForTests(null);
  vi.clearAllMocks();
});

describe("API auth gating (§13.10)", () => {
  it("401s every proposal route when unauthenticated", async () => {
    owner = null;
    expect((await listProposals()).status).toBe(401);
    expect((await createProposal(json("POST", sampleProposal))).status).toBe(401);
  });

  it("scopes proposals to the signed-in owner — another owner cannot see or touch them", async () => {
    const created = ((await (await createProposal(json("POST", sampleProposal))).json()) as { proposal: { id: string } })
      .proposal;

    // owner_a sees it
    const mine = (await (await listProposals()).json()) as { proposals: { id: string }[] };
    expect(mine.proposals.map((p) => p.id)).toContain(created.id);

    // switch to a different signed-in user
    owner = "owner_b";
    const theirs = (await (await listProposals()).json()) as { proposals: unknown[] };
    expect(theirs.proposals).toHaveLength(0);

    expect((await getProposal(json("GET"), ctx(created.id))).status).toBe(404);
    expect((await saveProposal(json("PUT", sampleProposal), ctx(created.id))).status).toBe(404);
    expect((await exportPdf(json("POST"), ctx(created.id))).status).toBe(404);
    expect((await deleteProposal(json("DELETE"), ctx(created.id))).status).toBe(404);

    // and the record still belongs to owner_a
    const still = await getRepo().getProposal(created.id);
    expect(still?.ownerId).toBe("owner_a");
  });

  it("lets the owner read their own proposal", async () => {
    const created = ((await (await createProposal(json("POST", sampleProposal))).json()) as { proposal: { id: string } })
      .proposal;
    expect((await getProposal(json("GET"), ctx(created.id))).status).toBe(200);
  });
});
