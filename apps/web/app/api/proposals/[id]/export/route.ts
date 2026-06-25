import { NextResponse } from "next/server";
import { openTemplate, validateForExport, getPageFormat } from "@proposal/shared";
import { getRepo } from "../../../../../src/server/repo";
import { renderUrlToPdf } from "../../../../../src/server/pdf/renderProposalPdf";
import { requireOwnedProposal } from "../../../../../src/server/auth/guard";
import { mintRenderToken } from "../../../../../src/server/auth/renderToken";
import { getMergedTemplates } from "../../../../../src/server/registry/activeTemplates";
import { audit } from "../../../../../src/server/audit";

// Puppeteer needs the Node runtime and headroom for Chromium (§ research).
export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/proposals/[id]/export — the export gate + render (§9, §10.3).
 * Re-validates against the template (hard gate), snapshots a version (§7.3),
 * then renders /print/[id] to a PDF and streams it back.
 */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const repo = getRepo();

  const stored = await requireOwnedProposal(id);
  if (stored instanceof Response) return stored;

  const templates = await getMergedTemplates();
  const template = templates.find((t) => t.id === stored.document.templateId) ?? openTemplate;
  const gate = validateForExport(stored.document, template);
  if (!gate.valid) {
    return NextResponse.json({ error: "Export blocked", errors: gate.errors }, { status: 422 });
  }

  await repo.snapshotVersion(id);

  // Chromium loads /print with no user session — authorise it with a short-lived signed token.
  const origin = new URL(request.url).origin;
  const token = mintRenderToken(id);
  const fmt = getPageFormat(stored.document.pageFormat);
  const pdf = await renderUrlToPdf(`${origin}/print/${id}?t=${encodeURIComponent(token)}`, fmt);

  await audit({
    action: "proposal.exported",
    workspaceId: stored.workspaceId,
    targetType: "proposal",
    targetId: id,
  });

  return new Response(pdf as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="proposal-${id}.pdf"`,
    },
  });
}
