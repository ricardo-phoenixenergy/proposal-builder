import { NextResponse } from "next/server";
import { generateSection } from "../../../../src/server/generateSection";
import { anthropicCreateMessage } from "../../../../src/server/anthropic";
import { requireOwner } from "../../../../src/server/auth/guard";
import { getActiveModel } from "../../../../src/server/aiModel";

/**
 * POST /api/refine/section — revise existing copy per an instruction (§10.1).
 * Reuses the generation path with a brief that embeds the current data so the
 * model rewrites rather than starts fresh; returns only this section's data.
 */
export async function POST(request: Request): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const body: unknown = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { type?: unknown }).type !== "string" ||
    typeof (body as { instruction?: unknown }).instruction !== "string"
  ) {
    return NextResponse.json({ error: "Expected { type, instruction, data }" }, { status: 400 });
  }

  const { type, instruction, data, sectionId } = body as {
    type: string;
    instruction: string;
    data?: unknown;
    sectionId?: string;
  };

  const model = await getActiveModel();

  const brief = [
    "Revise the existing section copy according to the instruction.",
    "",
    "Current content (JSON):",
    JSON.stringify(data ?? {}, null, 2),
    "",
    "Instruction:",
    instruction,
  ].join("\n");

  const result = await generateSection(
    { type, brief, model, ...(sectionId !== undefined ? { sectionId } : {}) },
    anthropicCreateMessage,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ data: result.data, validation: result.validation });
}
