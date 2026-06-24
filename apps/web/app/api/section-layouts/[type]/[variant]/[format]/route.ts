import { NextResponse } from "next/server";
import type { SectionLayout } from "@proposal/shared";
import { requireAdmin } from "../../../../../../src/server/auth/guard";
import { getRepo } from "../../../../../../src/server/repo";
import {
  getMergedLayouts,
  invalidateActiveLayouts,
} from "../../../../../../src/server/registry/activeLayouts";
import { invalidLayout } from "../../../route";

type Ctx = { params: Promise<{ type: string; variant: string; format: string }> };

const exists = async (type: string, variant: string, format: string) =>
  (await getMergedLayouts()).some(
    (l) => l.type === type && l.variant === variant && l.pageFormat === format,
  );

export async function PUT(request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { type, variant, format } = await params;

  if (!(await exists(type, variant, format)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const layout = (await request.json().catch(() => null)) as SectionLayout | null;
  const bad = invalidLayout(layout);
  if (bad) return bad;
  // The path identity is canonical; ignore any mismatching identity in the body.
  const saved = await getRepo().upsertSectionLayout({
    ...(layout as SectionLayout),
    type,
    variant,
    pageFormat: format,
  });
  invalidateActiveLayouts();
  return NextResponse.json({ layout: saved });
}

export async function DELETE(_request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { type, variant, format } = await params;

  const deleted = await getRepo().deleteSectionLayout(type, variant, format);
  invalidateActiveLayouts();
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
