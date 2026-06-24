// apps/web/app/api/section-types/[type]/route.ts
import { NextResponse } from "next/server";
import {
  builtInSectionTypes,
  validateSectionTypeDefinition,
  type SectionTypeSchema,
} from "@proposal/shared";
import { requireAdmin } from "../../../../src/server/auth/guard";
import { getRepo } from "../../../../src/server/repo";
import { invalidateActiveRegistry } from "../../../../src/server/registry/activeRegistry";

type Ctx = { params: Promise<{ type: string }> };

/**
 * PUT — edit a type. Authored types are updated in place; built-ins are
 * customised via a same-key authored OVERRIDE (the code definition stays as a
 * fallback). In-use types stay frozen (409) so stored proposals can't drift.
 */
export async function PUT(request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { type } = await params;

  const isBuiltIn = builtInSectionTypes.some((t) => t.type === type);
  const rows = await getRepo().listSectionTypeRows();
  const existing = rows.find((r) => r.type === type && r.definition);
  // Editable if it's a built-in (override) or an existing authored row; else unknown.
  if (!existing && !isBuiltIn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if ((await getRepo().listInUseTypeKeys()).includes(type)) {
    return NextResponse.json(
      { error: "Type is in use — duplicate it to change it" },
      { status: 409 },
    );
  }

  const def = (await request.json().catch(() => null)) as SectionTypeSchema | null;
  const result = validateSectionTypeDefinition(def);
  if (!result.valid) {
    return NextResponse.json(
      { error: "Invalid section type", errors: result.errors },
      { status: 400 },
    );
  }
  // Key is immutable on edit: keep the path's type.
  const row = await getRepo().upsertSectionType({
    type,
    definition: { ...(def as SectionTypeSchema), type },
    deprecated: existing?.deprecated ?? false,
  });
  invalidateActiveRegistry();
  return NextResponse.json({ sectionType: row.definition });
}
