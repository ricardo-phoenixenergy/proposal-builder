import { NextResponse } from "next/server";
import { getRepo } from "../../../../../../src/server/repo";
import { requireOwnedProposal } from "../../../../../../src/server/auth/guard";
import { audit } from "../../../../../../src/server/audit";

type Ctx = { params: Promise<{ id: string; token: string }> };

/** DELETE /api/proposals/[id]/shares/[token] — revoke a share link (editor+). */
export async function DELETE(_request: Request, { params }: Ctx): Promise<Response> {
  const { id, token } = await params;
  const stored = await requireOwnedProposal(id, "editor");
  if (stored instanceof Response) return stored;

  // The token must belong to this proposal — never let one proposal revoke another's
  // link (and a non-matching/unknown token is a 404, not a leak).
  const link = await getRepo().getShareLink(token);
  if (!link || link.proposalId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ok = await getRepo().revokeShareLink(token);
  if (!ok) return NextResponse.json({ error: "Already revoked" }, { status: 409 });

  await audit({
    action: "share.revoked",
    workspaceId: stored.workspaceId,
    targetType: "proposal",
    targetId: id,
    detail: { token },
  });

  return NextResponse.json({ ok: true });
}
