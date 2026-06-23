import { NextResponse } from "next/server";
import { validateLayout, getSectionType, PAGE_FORMATS, type SectionLayout } from "@proposal/shared";
import { requireOwner, requireAdmin } from "../../../src/server/auth/guard";
import { getRepo } from "../../../src/server/repo";
import { getMergedLayouts, invalidateActiveLayouts } from "../../../src/server/registry/activeLayouts";

export async function GET(): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  return NextResponse.json({ layouts: await getMergedLayouts() });
}

/** Validate a layout's type, page format, and structure. Returns an error Response or null. */
function invalidLayout(layout: SectionLayout | null): Response | null {
  if (!layout || typeof layout !== "object") {
    return NextResponse.json({ error: "Invalid layout" }, { status: 400 });
  }
  const typeSchema = getSectionType(layout.type);
  if (!typeSchema) return NextResponse.json({ error: `Unknown section type "${layout.type}"` }, { status: 400 });
  if (!PAGE_FORMATS.some((f) => f.id === layout.pageFormat)) {
    return NextResponse.json({ error: `Unknown page format "${layout.pageFormat}"` }, { status: 400 });
  }
  const result = validateLayout(layout, typeSchema);
  if (!result.valid) return NextResponse.json({ error: "Invalid layout", errors: result.errors }, { status: 400 });
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  const layout = (await request.json().catch(() => null)) as SectionLayout | null;
  const bad = invalidLayout(layout);
  if (bad) return bad;
  const l = layout as SectionLayout;

  if ((await getMergedLayouts()).some((x) => x.type === l.type && x.variant === l.variant && x.pageFormat === l.pageFormat)) {
    return NextResponse.json({ error: `A layout "${l.type}:${l.variant}:${l.pageFormat}" already exists` }, { status: 409 });
  }

  const saved = await getRepo().upsertSectionLayout(l);
  invalidateActiveLayouts();
  return NextResponse.json({ layout: saved }, { status: 201 });
}

export { invalidLayout };
