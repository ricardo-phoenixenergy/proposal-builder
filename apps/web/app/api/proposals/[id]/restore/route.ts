import { NextResponse } from "next/server";
import { getRepo } from "../../../../../src/server/repo";
import { requireTrashedProposal } from "../../../../../src/server/auth/guard";
import { audit } from "../../../../../src/server/audit";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/proposals/[id]/restore — bring a trashed proposal back to the active list (4a). */
export async function POST(_request: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const trashed = await requireTrashedProposal(id);
  if (trashed instanceof Response) return trashed;
  const ok = await getRepo().restoreProposal(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await audit({
    action: "proposal.restored",
    workspaceId: trashed.workspaceId,
    targetType: "proposal",
    targetId: id,
  });
  return NextResponse.json({ ok: true });
}
