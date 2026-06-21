import { NextResponse } from "next/server";
import type { StoredProposal } from "../repo/types";
import { getRepo } from "../repo";
import { getOwner } from "./owner";
import { getSessionUser } from "./sessionUser";

/** Resolve the signed-in owner, or a 401 Response to return from the handler. */
export async function requireOwner(): Promise<string | Response> {
  const owner = await getOwner();
  return owner ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Resolve the signed-in ADMIN's owner id, or a Response: 401 unauth, 403 non-admin. */
export async function requireAdmin(): Promise<string | Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return user.id;
}

/**
 * Load a proposal owned by the signed-in user, or a Response to return:
 * 401 when unauthenticated, 404 when missing OR owned by someone else
 * (a 404 rather than 403 so we never leak that the id exists).
 */
export async function requireOwnedProposal(id: string): Promise<StoredProposal | Response> {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const stored = await getRepo().getProposal(id);
  if (!stored || stored.ownerId !== owner) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return stored;
}
