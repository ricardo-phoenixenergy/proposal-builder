import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireOwner } from "../../../src/server/auth/guard";

export const runtime = "nodejs";

/**
 * POST /api/assets — upload a logo/image to Vercel Blob (§10.2). Auth-gated and
 * namespaced by owner. Returns the public URL, which the client stores in a theme
 * token / section data (never raw bytes in the proposal JSON).
 */
export async function POST(request: Request): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected a 'file' field" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 415 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blob = await put(`assets/${owner}/${safeName}`, file, {
    access: "public",
    addRandomSuffix: true,
  });

  return NextResponse.json({ url: blob.url });
}
