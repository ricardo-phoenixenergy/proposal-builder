import { NextResponse } from "next/server";
import { getRepo } from "../../../../src/server/repo";

export const runtime = "nodejs";

/** Days a proposal stays in the trash before the scheduled job purges it (4b). */
const DEFAULT_TTL_DAYS = 30;

/**
 * GET /api/cron/purge-trash — Vercel Cron job (daily). Permanently deletes
 * proposals that have been in the trash longer than the TTL. Authorised by the
 * CRON_SECRET bearer token Vercel sends; rejects everything if the secret is
 * unset, so the endpoint is never open. Public to the session gate (auth.config).
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ttlDays = Number(process.env.TRASH_TTL_DAYS ?? DEFAULT_TTL_DAYS);
  const olderThan = new Date(Date.now() - ttlDays * 86_400_000);
  const purged = await getRepo().purgeExpiredTrash(olderThan);
  return NextResponse.json({ purged });
}
