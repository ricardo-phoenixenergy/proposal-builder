// apps/web/app/api/folders/route.ts
import { NextResponse } from "next/server";
import { getOwner } from "../../../src/server/auth/owner";
import { getRepo } from "../../../src/server/repo";

/** GET — list the owner's folders. */
export async function GET(): Promise<Response> {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ folders: await getRepo().listFolders(owner) });
}

/** POST — create a folder. Body { name }. */
export async function POST(request: Request): Promise<Response> {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name === "") return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  return NextResponse.json({ folder: await getRepo().createFolder(owner, name) }, { status: 201 });
}
