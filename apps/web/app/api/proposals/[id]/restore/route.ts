import { NextResponse } from "next/server";
import { getRepo } from "../../../../../src/server/repo";
import { requireTrashedProposal } from "../../../../../src/server/auth/guard";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/proposals/[id]/restore — bring a trashed proposal back to the active list (4a). */
export async function POST(_request: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const trashed = await requireTrashedProposal(id);
  if (trashed instanceof Response) return trashed;
  const ok = await getRepo().restoreProposal(id);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
