import { NextResponse } from "next/server";
import { getRepo } from "../../../../../src/server/repo";
import { requireOwnedProposal } from "../../../../../src/server/auth/guard";

type Ctx = { params: Promise<{ id: string }> };

/** GET — list version snapshots. POST — capture the current document as a version. Owner-scoped. */
export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const owned = await requireOwnedProposal(id);
  if (owned instanceof Response) return owned;
  return NextResponse.json({ versions: await getRepo().listVersions(id) });
}

export async function POST(_request: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const owned = await requireOwnedProposal(id);
  if (owned instanceof Response) return owned;
  const version = await getRepo().snapshotVersion(id);
  return version
    ? NextResponse.json({ version }, { status: 201 })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
