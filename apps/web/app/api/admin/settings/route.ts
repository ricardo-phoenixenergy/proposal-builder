import { NextResponse } from "next/server";
import { isSelectableModel } from "@proposal/shared";
import { requireAdmin } from "../../../../src/server/auth/guard";
import { getRepo } from "../../../../src/server/repo";
import { getActiveModel } from "../../../../src/server/aiModel";

/** GET — the active AI model (admin only). */
export async function GET(): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  return NextResponse.json({ aiModel: await getActiveModel() });
}

/** PUT — set the AI model (admin only); must be on the allowlist. */
export async function PUT(request: Request): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const body = (await request.json().catch(() => null)) as { aiModel?: unknown } | null;
  if (!body || !isSelectableModel(body.aiModel)) {
    return NextResponse.json({ error: "Expected { aiModel } from the allowlist" }, { status: 400 });
  }
  await getRepo().setAiModel(body.aiModel);
  return NextResponse.json({ aiModel: body.aiModel });
}
