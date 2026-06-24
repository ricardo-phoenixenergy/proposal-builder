// apps/web/app/api/templates/route.ts
import { NextResponse } from "next/server";
import { validateTemplateDefinition, type Template } from "@proposal/shared";
import { requireOwner, requireAdmin } from "../../../src/server/auth/guard";
import { getRepo } from "../../../src/server/repo";
import {
  getMergedTemplates,
  invalidateActiveTemplates,
} from "../../../src/server/registry/activeTemplates";
import { getMergedSectionTypes } from "../../../src/server/registry/activeRegistry";
import { themes } from "../../../src/theme/themes";

/** GET — the merged active template list (any authed user; the picker needs it). */
export async function GET(): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  return NextResponse.json({ templates: await getMergedTemplates() });
}

/** POST — create or duplicate an authored template (admin). */
export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  const def = (await request.json().catch(() => null)) as Template | null;
  const ctx = { sectionTypes: await getMergedSectionTypes(), themeIds: themes.map((t) => t.id) };
  const result = validateTemplateDefinition(def, ctx);
  if (!result.valid) {
    return NextResponse.json({ error: "Invalid template", errors: result.errors }, { status: 400 });
  }
  const id = (def as Template).id;

  if ((await getMergedTemplates()).some((t) => t.id === id)) {
    return NextResponse.json({ error: `A template "${id}" already exists` }, { status: 409 });
  }

  const row = await getRepo().upsertTemplate({ id, template: def as Template, deprecated: false });
  invalidateActiveTemplates();
  return NextResponse.json({ template: row.template }, { status: 201 });
}
