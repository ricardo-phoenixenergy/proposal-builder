import { NextResponse } from "next/server";
import { getRepo } from "../../../../../src/server/repo";
import { requireOwnedProposal } from "../../../../../src/server/auth/guard";
import { getOwner } from "../../../../../src/server/auth/owner";
import { audit } from "../../../../../src/server/audit";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/proposals/[id]/shares — list this proposal's share links (viewer+). */
export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const stored = await requireOwnedProposal(id, "viewer");
  if (stored instanceof Response) return stored;
  return NextResponse.json({ links: await getRepo().listShareLinks(id) });
}

/**
 * POST /api/proposals/[id]/shares — mint a client share link (editor+).
 * Body: { allowExport?: boolean; expiresAt?: string | null }.
 */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const stored = await requireOwnedProposal(id, "editor");
  if (stored instanceof Response) return stored;

  const body = (await request.json().catch(() => null)) as {
    allowExport?: unknown;
    expiresAt?: unknown;
  } | null;

  // allowExport defaults to true; only an explicit `false` turns export off.
  const allowExport = body?.allowExport !== false;

  let expiresAt: string | null = null;
  if (typeof body?.expiresAt === "string" && body.expiresAt.length > 0) {
    const ms = Date.parse(body.expiresAt);
    if (!Number.isFinite(ms) || ms <= Date.now()) {
      return NextResponse.json({ error: "expiresAt must be a future date" }, { status: 400 });
    }
    expiresAt = new Date(ms).toISOString();
  }

  // The guard already confirmed an authenticated member, so getOwner resolves.
  const createdBy = (await getOwner()) ?? stored.ownerId;
  const link = await getRepo().createShareLink({
    proposalId: id,
    workspaceId: stored.workspaceId,
    createdBy,
    allowExport,
    expiresAt,
  });

  await audit({
    action: "share.created",
    workspaceId: stored.workspaceId,
    targetType: "proposal",
    targetId: id,
    detail: { token: link.token, allowExport, expiresAt },
  });

  return NextResponse.json({ link }, { status: 201 });
}
