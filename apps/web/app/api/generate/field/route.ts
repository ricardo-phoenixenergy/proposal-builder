import { NextResponse } from "next/server";
import { checkGenerationInput } from "@proposal/shared";
import { generateField } from "../../../../src/server/generateField";
import { anthropicCreateMessage } from "../../../../src/server/anthropic";
import { requireOwner } from "../../../../src/server/auth/guard";
import { getActiveModel } from "../../../../src/server/aiModel";

/**
 * POST /api/generate/field — rewrite one AI-composable field (§10). The model is
 * the admin setting; the client supplies the field instruction + current value.
 */
export async function POST(request: Request): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const body: unknown = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { type?: unknown }).type !== "string" ||
    typeof (body as { fieldKey?: unknown }).fieldKey !== "string" ||
    typeof (body as { brief?: unknown }).brief !== "string"
  ) {
    return NextResponse.json({ error: "Expected { type, fieldKey, brief }" }, { status: 400 });
  }

  const { type, fieldKey, brief, instruction, currentValue, sectionId } = body as {
    type: string;
    fieldKey: string;
    brief: string;
    instruction?: string;
    currentValue?: string;
    sectionId?: string;
  };

  const limitError = checkGenerationInput({ brief, ...(instruction !== undefined ? { instruction } : {}) });
  if (limitError) return NextResponse.json({ error: limitError }, { status: 400 });

  const model = await getActiveModel();
  const result = await generateField(
    {
      type,
      fieldKey,
      brief,
      model,
      ...(instruction !== undefined ? { instruction } : {}),
      ...(currentValue !== undefined ? { currentValue } : {}),
      ...(sectionId !== undefined ? { sectionId } : {}),
    },
    anthropicCreateMessage,
  );
  if (!result.ok) {
    const status = result.error?.includes("isn't AI-composable") ? 400 : 422;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ value: result.value, validation: result.validation });
}
