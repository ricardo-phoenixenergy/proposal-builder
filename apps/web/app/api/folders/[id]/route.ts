// apps/web/app/api/folders/[id]/route.ts
import { NextResponse } from "next/server";
import { getOwner } from "../../../../src/server/auth/owner";
import { getRepo } from "../../../../src/server/repo";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH — rename a folder. Body { name }. */
export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name === "") return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  const folder = await getRepo().renameFolder(owner, id, name);
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ folder });
}

/** DELETE — remove a folder; its proposals become Unfiled. */
export async function DELETE(_request: Request, { params }: Ctx): Promise<Response> {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await getRepo().deleteFolder(owner, id);
  return ok ? new Response(null, { status: 204 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
