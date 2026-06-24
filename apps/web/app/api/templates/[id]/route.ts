// apps/web/app/api/templates/[id]/route.ts
import { NextResponse } from "next/server";
import { builtInTemplates, validateTemplateDefinition, type Template } from "@proposal/shared";
import { requireAdmin } from "../../../../src/server/auth/guard";
import { getRepo } from "../../../../src/server/repo";
import { getMergedSectionTypes } from "../../../../src/server/registry/activeRegistry";
import { invalidateActiveTemplates } from "../../../../src/server/registry/activeTemplates";
import { themes } from "../../../../src/theme/themes";

type Ctx = { params: Promise<{ id: string }> };

/** PUT — edit an authored template. Built-ins and in-use templates are frozen (409). */
export async function PUT(request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { id } = await params;

  if (builtInTemplates.some((t) => t.id === id)) {
    return NextResponse.json(
      { error: "Built-in templates are immutable — duplicate it instead" },
      { status: 409 },
    );
  }

  const rows = await getRepo().listTemplateRows();
  const existing = rows.find((r) => r.id === id && r.template);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if ((await getRepo().listInUseTemplateIds()).includes(id)) {
    return NextResponse.json(
      { error: "Template is in use — duplicate it to change it" },
      { status: 409 },
    );
  }

  const def = (await request.json().catch(() => null)) as Template | null;
  const ctx = { sectionTypes: await getMergedSectionTypes(), themeIds: themes.map((t) => t.id) };
  const result = validateTemplateDefinition(def, ctx);
  if (!result.valid) {
    return NextResponse.json({ error: "Invalid template", errors: result.errors }, { status: 400 });
  }
  // id is immutable on edit: keep the path's id.
  const row = await getRepo().upsertTemplate({
    id,
    template: { ...(def as Template), id },
    deprecated: existing.deprecated,
  });
  invalidateActiveTemplates();
  return NextResponse.json({ template: row.template });
}
