import { NextResponse } from "next/server";
import type { ProposalDocument } from "@proposal/shared";
import { getRepo } from "../../../src/server/repo";
import { getOwner } from "../../../src/server/auth/owner";

/** GET /api/proposals — list summaries. POST — create from a document body (§10.2). */
export async function GET(): Promise<Response> {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const proposals = await getRepo().listProposals(owner);
  return NextResponse.json({ proposals });
}

export async function POST(request: Request): Promise<Response> {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as
    | { document?: ProposalDocument; folderId?: string | null }
    | ProposalDocument
    | null;
  // Back-compat: accept either a bare document or { document, folderId }.
  const document =
    (body && "document" in body
      ? (body as { document?: ProposalDocument }).document
      : (body as ProposalDocument)) ?? null;
  const folderId =
    body && "folderId" in body ? ((body as { folderId?: string | null }).folderId ?? null) : null;
  if (!document || typeof document !== "object" || !Array.isArray(document.sections)) {
    return NextResponse.json({ error: "Expected a ProposalDocument" }, { status: 400 });
  }
  const proposal = await getRepo().createProposal(owner, document, folderId);
  return NextResponse.json({ proposal }, { status: 201 });
}
