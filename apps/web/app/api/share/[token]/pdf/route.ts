import { NextResponse } from "next/server";
import { getPageFormat } from "@proposal/shared";
import { renderUrlToPdf } from "../../../../../src/server/pdf/renderProposalPdf";
import { mintRenderToken } from "../../../../../src/server/auth/renderToken";
import { resolveSharedProposal } from "../../../../../src/server/share/resolveSharedProposal";

// Puppeteer needs the Node runtime and headroom for Chromium (§ research).
export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ token: string }> };

/**
 * GET /api/share/[token]/pdf — public PDF download for a share link (2b).
 * Public to the session gate; authorised solely by the unguessable token. 404 if the
 * link is unusable/missing, 403 if the link disallows export. No version snapshot is
 * taken (a client view is not an export event) and no export gate is re-run.
 */
export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  const { token } = await params;
  const resolved = await resolveSharedProposal(token);
  if (!resolved) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!resolved.link.allowExport) {
    return NextResponse.json({ error: "Download not permitted" }, { status: 403 });
  }

  const { proposal } = resolved;
  // Chromium loads /print with no session — authorise it with a short-lived render token.
  const origin = new URL(_request.url).origin;
  const renderToken = mintRenderToken(proposal.id);
  const fmt = getPageFormat(proposal.document.pageFormat);
  const pdf = await renderUrlToPdf(
    `${origin}/print/${proposal.id}?t=${encodeURIComponent(renderToken)}`,
    fmt,
  );

  return new Response(pdf as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="proposal-${proposal.id}.pdf"`,
    },
  });
}
