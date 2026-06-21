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

/** PATCH — rename (title) and/or move (folderId). Owner-scoped. */
export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const owned = await requireOwnedProposal(id);
  if (owned instanceof Response) return owned;

  const body = (await request.json().catch(() => null)) as { title?: unknown; folderId?: unknown } | null;
  const patch: { title?: string; folderId?: string | null } = {};
  if (typeof body?.title === "string" && body.title.trim() !== "") patch.title = body.title.trim();
  if (body && "folderId" in body) {
    const fid = body.folderId;
    if (fid !== null && typeof fid !== "string") return NextResponse.json({ error: "Invalid folderId" }, { status: 400 });
    if (typeof fid === "string") {
      const owns = (await getRepo().listFolders(owned.ownerId)).some((f) => f.id === fid);
      if (!owns) return NextResponse.json({ error: "Unknown folder" }, { status: 400 });
    }
    patch.folderId = fid as string | null;
  }
  if (patch.title === undefined && patch.folderId === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const summary = await getRepo().updateProposalMeta(id, patch);
  if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ proposal: summary });
}
