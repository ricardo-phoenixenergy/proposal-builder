// apps/web/app/api/section-types/[type]/deprecate/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../src/server/auth/guard";
import { getRepo } from "../../../../../src/server/repo";
import { invalidateActiveRegistry } from "../../../../../src/server/registry/activeRegistry";

type Ctx = { params: Promise<{ type: string }> };

/** POST — deprecate (hide from pickers) or restore a section type. Body { deprecated }. */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { type } = await params;

  const body = (await request.json().catch(() => null)) as { deprecated?: unknown } | null;
  const deprecated = body?.deprecated === true;

  const row = await getRepo().setSectionTypeDeprecated(type, deprecated);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  invalidateActiveRegistry();
  return NextResponse.json({ sectionType: row });
}
