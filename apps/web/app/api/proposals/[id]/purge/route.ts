import { NextResponse } from "next/server";
import { getRepo } from "../../../../../src/server/repo";
import { requireTrashedProposal } from "../../../../../src/server/auth/guard";
import { audit } from "../../../../../src/server/audit";

type Ctx = { params: Promise<{ id: string }> };

/**
 * DELETE /api/proposals/[id]/purge — permanently delete a trashed proposal and all
 * its versions (4a). Only reachable for a proposal already in the trash.
 */
export async function DELETE(_request: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const trashed = await requireTrashedProposal(id);
  if (trashed instanceof Response) return trashed;
  const ok = await getRepo().purgeProposal(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await audit({
    action: "proposal.purged",
    workspaceId: trashed.workspaceId,
    targetType: "proposal",
    targetId: id,
  });
  return new Response(null, { status: 204 });
}
