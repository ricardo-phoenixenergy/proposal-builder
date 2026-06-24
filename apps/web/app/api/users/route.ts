// apps/web/app/api/users/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "../../../src/server/auth/guard";
import { hashPassword } from "../../../src/server/auth/password";
import { isValidEmail } from "../../../src/server/auth/email";
import { getRepo } from "../../../src/server/repo";
import { DuplicateEmailError, type UserSummary } from "../../../src/server/repo/types";

/** GET — list all accounts (admin only). */
export async function GET(): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  return NextResponse.json({ users: await getRepo().listUsers() });
}

/** POST — create an account (admin only). Body { email, password, isAdmin? }. */
export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
    isAdmin?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const isAdmin = body?.isAdmin === true;

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (password.trim().length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  try {
    const user = await getRepo().createUser({
      email,
      passwordHash: await hashPassword(password),
      isAdmin,
    });
    const summary: UserSummary = {
      id: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
      disabled: user.disabled,
      createdAt: user.createdAt,
    };
    return NextResponse.json({ user: summary }, { status: 201 });
  } catch (e) {
    if (e instanceof DuplicateEmailError) {
      return NextResponse.json(
        { error: "An account with that email already exists" },
        { status: 409 },
      );
    }
    throw e;
  }
}
