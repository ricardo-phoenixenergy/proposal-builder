// apps/web/app/api/users/[id]/password/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../src/server/auth/guard";
import { hashPassword } from "../../../../../src/server/auth/password";
import { getRepo } from "../../../../../src/server/repo";

type Ctx = { params: Promise<{ id: string }> };

/** POST — admin sets a new password for an account. Body { password }. */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.trim().length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const ok = await getRepo().setUserPassword(id, hashPassword(password));
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
