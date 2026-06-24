import { NextResponse } from "next/server";
import { checkGenerationInput } from "@proposal/shared";
import { generateSection } from "../../../../src/server/generateSection";
import { anthropicCreateMessage } from "../../../../src/server/anthropic";
import { requireOwner } from "../../../../src/server/auth/guard";
import { getActiveModel } from "../../../../src/server/aiModel";

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

  const { type, brief, instruction, sectionId } = body as {
    type: string;
    brief: string;
    instruction?: string;
    sectionId?: string;
  };

  const limitError = checkGenerationInput({
    brief,
    ...(instruction !== undefined ? { instruction } : {}),
  });
  if (limitError) return NextResponse.json({ error: limitError }, { status: 400 });

  const model = await getActiveModel();
  const result = await generateSection(
    {
      type,
      brief,
      model,
      ...(instruction !== undefined ? { instruction } : {}),
      ...(sectionId !== undefined ? { sectionId } : {}),
    },
    anthropicCreateMessage,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ data: result.data, validation: result.validation });
}
