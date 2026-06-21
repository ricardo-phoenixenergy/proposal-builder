// @vitest-environment node
/**
 * Regression test: the export gate consults the authored (DB-stored) template,
 * not just the in-code built-in registry. Before Finding-1 the route called
 * getTemplate(id) which returns undefined for authored ids, falling back to
 * openTemplate (locked:false). That allowed a tampered fixed field through (200).
 * After the fix the route calls getMergedTemplates() which includes the authored
 * locked template, so tampered fixed content is caught and returns 422.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTemplate } from "@proposal/shared";

// Mock the Chromium renderer so we can assert it was NOT called.
vi.mock("../server/pdf/renderProposalPdf", () => ({
  renderUrlToPdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])), // "%PDF"
}));

import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { invalidateActiveTemplates } from "../server/registry/activeTemplates";
import { renderUrlToPdf } from "../server/pdf/renderProposalPdf";
import { POST as exportPdf } from "../../app/api/proposals/[id]/export/route";
import type { Template } from "@proposal/shared";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (id: string) => new Request(`http://localhost/api/proposals/${id}/export`, { method: "POST" });

const authored = {
  id: "tmpl_fixed_x",
  name: "Fixed",
  themeId: "theme_phoenix_default",
  locked: true,
  slots: [
    {
      kind: "fixed" as const,
      type: "text",
      lock: "fixed" as const,
      data: { heading: "Legal", body: "Immutable." },
    },
  ],
} satisfies Template;

beforeEach(async () => {
  setRepoForTests(createMemoryRepo());
  setOwnerResolverForTests(async () => "owner_local");
  // Seed the authored template into the repo and invalidate the server cache.
  await getRepo().upsertTemplate({ id: authored.id, template: authored, deprecated: false });
  invalidateActiveTemplates();
});

afterEach(() => {
  setRepoForTests(null);
  setOwnerResolverForTests(null);
  invalidateActiveTemplates();
  vi.clearAllMocks();
});

describe("POST /api/proposals/[id]/export — authored locked template gate", () => {
  it("422s when a fixed field has been tampered with, and does NOT call the renderer", async () => {
    // Scaffold a doc via applyTemplate (heading + body come from authored.slots[0].data).
    const doc = applyTemplate(authored);
    const created = await getRepo().createProposal("owner_local", doc);

    // Mutate the fixed field and save the corrupted document.
    const mutated = {
      ...created.document,
      sections: created.document.sections.map((s, i) =>
        i === 0 ? { ...s, data: { ...s.data, heading: "TAMPERED" } } : s,
      ),
    };
    await getRepo().saveProposal(created.id, mutated);

    const res = await exportPdf(req(created.id), ctx(created.id));

    expect(res.status).toBe(422);
    expect(renderUrlToPdf).not.toHaveBeenCalled();
  });

  it("200s when the fixed fields are intact (authored template resolves correctly)", async () => {
    // applyTemplate seeds the exact canonical data, so the gate should pass.
    const doc = applyTemplate(authored);
    const created = await getRepo().createProposal("owner_local", doc);

    const res = await exportPdf(req(created.id), ctx(created.id));

    expect(res.status).toBe(200);
    expect(renderUrlToPdf).toHaveBeenCalled();
  });
});
