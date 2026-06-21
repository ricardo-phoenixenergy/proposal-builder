// apps/web/app/api/templates/[id]/deprecate/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../src/server/auth/guard";
import { getRepo } from "../../../../../src/server/repo";
import { invalidateActiveTemplates } from "../../../../../src/server/registry/activeTemplates";

type Ctx = { params: Promise<{ id: string }> };

/** POST — deprecate (hide from the picker) or restore a template. Body { deprecated }. */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as { deprecated?: unknown } | null;
  const deprecated = body?.deprecated === true;

  const row = await getRepo().setTemplateDeprecated(id, deprecated);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  invalidateActiveTemplates();
  return NextResponse.json({ template: row });
}
