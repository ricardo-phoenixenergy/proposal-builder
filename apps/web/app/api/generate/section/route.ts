import { NextResponse } from "next/server";
import { generateSection } from "../../../../src/server/generateSection";
import { anthropicCreateMessage } from "../../../../src/server/anthropic";
import { requireOwner } from "../../../../src/server/auth/guard";

/**
 * POST /api/generate/section — generate one section's data (§10.1). Returns the
 * data plus its validation; the client merges it into only that section.
 */
export async function POST(request: Request): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const body: unknown = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { type?: unknown }).type !== "string" ||
    typeof (body as { brief?: unknown }).brief !== "string"
  ) {
    return NextResponse.json({ error: "Expected { type, brief }" }, { status: 400 });
  }

  const { type, brief, model, sectionId } = body as {
    type: string;
    brief: string;
    model?: string;
    sectionId?: string;
  };

  const result = await generateSection(
    { type, brief, ...(model !== undefined ? { model } : {}), ...(sectionId !== undefined ? { sectionId } : {}) },
    anthropicCreateMessage,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ data: result.data, validation: result.validation });
}
