// apps/web/app/api/section-types/route.ts
import { NextResponse } from "next/server";
import { validateSectionTypeDefinition, type SectionTypeSchema } from "@proposal/shared";
import { requireOwner, requireAdmin } from "../../../src/server/auth/guard";
import { getRepo } from "../../../src/server/repo";
import { getMergedSectionTypes, invalidateActiveRegistry } from "../../../src/server/registry/activeRegistry";

/** GET — list the merged active registry (any authed user). */
export async function GET(): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  return NextResponse.json({ sectionTypes: await getMergedSectionTypes() });
}

/** POST — create or duplicate an authored type (admin). */
export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  const def = (await request.json().catch(() => null)) as SectionTypeSchema | null;
  const result = validateSectionTypeDefinition(def);
  if (!result.valid) {
    return NextResponse.json({ error: "Invalid section type", errors: result.errors }, { status: 400 });
  }
  const type = (def as SectionTypeSchema).type;

  if ((await getMergedSectionTypes()).some((t) => t.type === type)) {
    return NextResponse.json({ error: `A section type "${type}" already exists` }, { status: 409 });
  }

  const row = await getRepo().upsertSectionType({ type, definition: def as SectionTypeSchema, deprecated: false });
  invalidateActiveRegistry();
  return NextResponse.json({ sectionType: row.definition }, { status: 201 });
}
