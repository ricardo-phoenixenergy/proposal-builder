import { NextResponse } from "next/server";
import type { ProposalDocument } from "@proposal/shared";
import { getRepo } from "../../../../src/server/repo";
import { requireOwnedProposal } from "../../../../src/server/auth/guard";

type Ctx = { params: Promise<{ id: string }> };

/** GET — read. PUT — autosave. DELETE — remove (§10.2). All owner-scoped. */
export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const owned = await requireOwnedProposal(id);
  if (owned instanceof Response) return owned;
  return NextResponse.json({ proposal: owned });
}

export async function PUT(request: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const owned = await requireOwnedProposal(id);
  if (owned instanceof Response) return owned;
  const document = (await request.json().catch(() => null)) as ProposalDocument | null;
  if (!document || typeof document !== "object" || !Array.isArray(document.sections)) {
    return NextResponse.json({ error: "Expected a ProposalDocument" }, { status: 400 });
  }
  const saved = await getRepo().saveProposal(id, document);
  return saved ? NextResponse.json({ proposal: saved }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_request: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const owned = await requireOwnedProposal(id);
  if (owned instanceof Response) return owned;
  const ok = await getRepo().deleteProposal(id);
  return ok ? new Response(null, { status: 204 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
