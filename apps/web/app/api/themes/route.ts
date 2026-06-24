import { NextResponse } from "next/server";
import { validateTheme, type ThemeTokens } from "@proposal/shared";
import { getRepo } from "../../../src/server/repo";
import { requireOwner } from "../../../src/server/auth/guard";

/** GET — list themes. POST/PUT — upsert a theme by id (§10.2). Owner-scoped. */
export async function GET(): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  return NextResponse.json({ themes: await getRepo().listThemes(owner) });
}

async function upsert(request: Request): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const tokens = (await request.json().catch(() => null)) as ThemeTokens | null;
  const result = validateTheme(tokens);
  if (!result.valid)
    return NextResponse.json({ error: "Invalid theme", errors: result.errors }, { status: 400 });
  const theme = await getRepo().upsertTheme(owner, tokens as ThemeTokens);
  return NextResponse.json({ theme });
}
export const POST = upsert;
export const PUT = upsert;
