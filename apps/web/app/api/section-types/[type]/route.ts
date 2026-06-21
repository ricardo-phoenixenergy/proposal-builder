// apps/web/app/api/section-types/[type]/route.ts
import { NextResponse } from "next/server";
import { builtInSectionTypes, validateSectionTypeDefinition, type SectionTypeSchema } from "@proposal/shared";
import { requireAdmin } from "../../../../src/server/auth/guard";
import { getRepo } from "../../../../src/server/repo";
import { invalidateActiveRegistry } from "../../../../src/server/registry/activeRegistry";

type Ctx = { params: Promise<{ type: string }> };

/** PUT — edit an authored type. Built-ins and in-use types are frozen (409). */
export async function PUT(request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { type } = await params;

  if (builtInSectionTypes.some((t) => t.type === type)) {
    return NextResponse.json({ error: "Built-in types are immutable — duplicate it instead" }, { status: 409 });
  }

  const rows = await getRepo().listSectionTypeRows();
  const existing = rows.find((r) => r.type === type && r.definition);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if ((await getRepo().listInUseTypeKeys()).includes(type)) {
    return NextResponse.json({ error: "Type is in use — duplicate it to change it" }, { status: 409 });
  }

  const def = (await request.json().catch(() => null)) as SectionTypeSchema | null;
  const result = validateSectionTypeDefinition(def);
  if (!result.valid) {
    return NextResponse.json({ error: "Invalid section type", errors: result.errors }, { status: 400 });
  }
  // Key is immutable on edit: keep the path's type.
  const row = await getRepo().upsertSectionType({ type, definition: { ...(def as SectionTypeSchema), type }, deprecated: existing.deprecated });
  invalidateActiveRegistry();
  return NextResponse.json({ sectionType: row.definition });
}
