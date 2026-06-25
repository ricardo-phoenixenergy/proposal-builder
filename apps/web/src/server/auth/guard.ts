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
async function canAccess(stored: StoredProposal | null, userId: string): Promise<boolean> {
  // 1b: access is workspace membership, not ownership. workspace_id is always
  // populated (backfilled + write paths); a null is treated as inaccessible.
  if (!stored?.workspaceId) return false;
  return getRepo().isWorkspaceMember(stored.workspaceId, userId);
}

export async function requireOwnedProposal(id: string): Promise<StoredProposal | Response> {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const stored = await getRepo().getProposal(id);
  // A trashed proposal is invisible to the normal edit/read surface (404, not 403):
  // it's reachable only via the restore/purge routes. Non-members get 404 (no leak).
  if (!stored || stored.deletedAt !== null || !(await canAccess(stored, owner)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return stored;
}

/**
 * Load a TRASHED proposal the signed-in user can access (for restore/purge), or a
 * Response: 401 unauthenticated, 404 when missing, not a workspace member, or not
 * in the trash.
 */
export async function requireTrashedProposal(id: string): Promise<StoredProposal | Response> {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const stored = await getRepo().getProposal(id);
  if (!stored || stored.deletedAt === null || !(await canAccess(stored, owner)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return stored;
}
