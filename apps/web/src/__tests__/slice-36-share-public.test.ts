// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { getRepo, setRepoForTests } from "../server/repo";
import { resolveSharedProposal } from "../server/share/resolveSharedProposal";
import { GET as sharePdf } from "../../app/api/share/[token]/pdf/route";

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
});
afterEach(() => {
  setRepoForTests(null);
});

async function setup(opts?: { allowExport?: boolean; expiresAt?: string | null }) {
  const proposal = await getRepo().createProposal("user_a", sampleProposal);
  const link = await getRepo().createShareLink({
    proposalId: proposal.id,
    workspaceId: "ws_a",
    createdBy: "user_a",
    allowExport: opts?.allowExport ?? true,
    expiresAt: opts?.expiresAt ?? null,
  });
  return { proposal, link };
}

const pdfCtx = (token: string) => ({ params: Promise.resolve({ token }) });
const pdfReq = () => new Request("http://x/api/share/t/pdf");

describe("resolveSharedProposal gates (2b)", () => {
  it("resolves a live link to its proposal", async () => {
    const { proposal, link } = await setup();
    const r = await resolveSharedProposal(link.token);
    expect(r?.proposal.id).toBe(proposal.id);
  });

  it("returns null for an unknown token", async () => {
    expect(await resolveSharedProposal("shr_nope")).toBeNull();
  });

  it("returns null once revoked", async () => {
    const { link } = await setup();
    await getRepo().revokeShareLink(link.token);
    expect(await resolveSharedProposal(link.token)).toBeNull();
  });

  it("returns null when expired", async () => {
    const { link } = await setup({ expiresAt: "2000-01-01T00:00:00.000Z" });
    expect(await resolveSharedProposal(link.token)).toBeNull();
  });

  it("returns null when the proposal is trashed", async () => {
    const { proposal, link } = await setup();
    await getRepo().deleteProposal(proposal.id);
    expect(await resolveSharedProposal(link.token)).toBeNull();
  });
});

describe("public PDF route gating (2b)", () => {
  it("404s an unknown / revoked token before rendering", async () => {
    const { link } = await setup();
    await getRepo().revokeShareLink(link.token);
    expect((await sharePdf(pdfReq(), pdfCtx(link.token))).status).toBe(404);
    expect((await sharePdf(pdfReq(), pdfCtx("shr_nope"))).status).toBe(404);
  });

  it("403s when the link disallows export", async () => {
    const { link } = await setup({ allowExport: false });
    expect((await sharePdf(pdfReq(), pdfCtx(link.token))).status).toBe(403);
  });
});
