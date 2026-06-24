// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTemplate, prelimTemplate, sampleProposal } from "@proposal/shared";

// Mock the Chromium renderer so the gate/orchestration is tested without a browser.
vi.mock("../server/pdf/renderProposalPdf", () => ({
  renderUrlToPdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])), // "%PDF"
}));

import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { renderUrlToPdf } from "../server/pdf/renderProposalPdf";
import { POST as exportPdf } from "../../app/api/proposals/[id]/export/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (id: string) => new Request(`http://localhost/api/proposals/${id}/export`, { method: "POST" });

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  setOwnerResolverForTests(async () => "owner_local");
});
afterEach(() => {
  setRepoForTests(null);
  setOwnerResolverForTests(null);
  vi.clearAllMocks();
});

describe("POST /api/proposals/[id]/export — the export gate + render (§9)", () => {
  it("404s for an unknown proposal", async () => {
    expect((await exportPdf(req("nope"), ctx("nope"))).status).toBe(404);
    expect(renderUrlToPdf).not.toHaveBeenCalled();
  });

  it("blocks (422) a locked doc with unfilled required fields — and does NOT render", async () => {
    // applyTemplate(prelim) leaves required fields blank → gate fails.
    const created = await getRepo().createProposal("owner_local", applyTemplate(prelimTemplate));
    const res = await exportPdf(req(created.id), ctx(created.id));
    expect(res.status).toBe(422);
    expect(renderUrlToPdf).not.toHaveBeenCalled();
  });

  it("renders a PDF for a valid (open-template) doc, snapshots a version, returns application/pdf", async () => {
    const created = await getRepo().createProposal("owner_local", sampleProposal); // tmpl_open → schema-only gate → valid
    const res = await exportPdf(req(created.id), ctx(created.id));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(renderUrlToPdf).toHaveBeenCalledWith(expect.stringContaining(`/print/${created.id}`), expect.objectContaining({ widthMm: expect.any(Number) }));

    const versions = await getRepo().listVersions(created.id);
    expect(versions).toHaveLength(1); // export snapshot captured (§7.3)
  });
});
