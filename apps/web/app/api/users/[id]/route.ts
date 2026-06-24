// apps/web/app/api/users/[id]/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../src/server/auth/guard";
import { assertCanModify, GuardError } from "../../../../src/server/auth/userGuards";
import { getRepo } from "../../../../src/server/repo";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH — disable/enable and/or promote/demote (admin only), behind guardrails. */
export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as {
    disabled?: unknown;
    isAdmin?: unknown;
  } | null;
  const change: { disabled?: boolean; isAdmin?: boolean } = {};
  if (typeof body?.disabled === "boolean") change.disabled = body.disabled;
  if (typeof body?.isAdmin === "boolean") change.isAdmin = body.isAdmin;
  if (change.disabled === undefined && change.isAdmin === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    await assertCanModify(admin, id, change);
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }

  const summary = await getRepo().patchUser(id, change);
  if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (change.disabled === true) {
    const { invalidateUserActiveCache } = await import("../../../../src/server/auth/sessionUser");
    invalidateUserActiveCache(id);
  }
  return NextResponse.json({ user: summary });
}
