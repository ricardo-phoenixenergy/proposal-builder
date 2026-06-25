import { NextResponse } from "next/server";
import type { StoredProposal, WorkspaceRole } from "../repo/types";
import { getRepo } from "../repo";
import { getOwner } from "./owner";
import { getSessionUser } from "./sessionUser";
import { roleAtLeast } from "./roles";

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
 * Authorise the acting user for a proposal (Theme 1b + 2):
 * - 401 when unauthenticated
 * - 404 when missing, on the wrong side of the trash, or NOT a workspace member
 *   (a non-member must not learn the id exists)
 * - 403 when a member whose role is below `minRole`
 * Otherwise returns the proposal.
 */
async function authorizeProposal(
  id: string,
  opts: { trashed: boolean; minRole: WorkspaceRole },
): Promise<StoredProposal | Response> {
  const userId = await getOwner();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const notFound = NextResponse.json({ error: "Not found" }, { status: 404 });
  const stored = await getRepo().getProposal(id);
  if (!stored || !stored.workspaceId) return notFound;
  // Trashed proposals are reachable only via restore/purge, live ones only via the
  // normal surface — a mismatch is a 404, not a leak.
  if (opts.trashed ? stored.deletedAt === null : stored.deletedAt !== null) return notFound;
  const role = await getRepo().getWorkspaceRole(stored.workspaceId, userId);
  if (role === null) return notFound; // not a member
  if (!roleAtLeast(role, opts.minRole))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return stored;
}

/** Active (non-trashed) proposal the user may access; `minRole` gates mutations (Theme 2). */
export function requireOwnedProposal(
  id: string,
  minRole: WorkspaceRole = "viewer",
): Promise<StoredProposal | Response> {
  return authorizeProposal(id, { trashed: false, minRole });
}

/** Trashed proposal the user may access (restore/purge); editor+ by default. */
export function requireTrashedProposal(
  id: string,
  minRole: WorkspaceRole = "editor",
): Promise<StoredProposal | Response> {
  return authorizeProposal(id, { trashed: true, minRole });
}
