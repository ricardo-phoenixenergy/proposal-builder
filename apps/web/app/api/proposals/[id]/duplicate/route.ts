// apps/web/app/api/proposals/[id]/duplicate/route.ts
import { NextResponse } from "next/server";
import { getOwner } from "../../../../../src/server/auth/owner";
import { getRepo } from "../../../../../src/server/repo";

type Ctx = { params: Promise<{ id: string }> };

/** POST — duplicate an owned proposal as "Copy of …". */
export async function POST(_request: Request, { params }: Ctx): Promise<Response> {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const dup = await getRepo().duplicateProposal(owner, id);
  if (!dup) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    {
      proposal: {
        id: dup.id,
        title: dup.document.title,
        client: dup.document.client?.name ?? "",
        folderId: dup.folderId,
        updatedAt: dup.updatedAt,
      },
    },
    { status: 201 },
  );
}
