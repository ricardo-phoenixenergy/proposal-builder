import type { WorkspaceRole } from "../repo/types";

/** Workspace role hierarchy (Theme 2): viewer < editor < admin. */
const RANK: Record<WorkspaceRole, number> = { viewer: 0, editor: 1, admin: 2 };

/** True when `role` is at least as privileged as `min`. */
export function roleAtLeast(role: WorkspaceRole, min: WorkspaceRole): boolean {
  return RANK[role] >= RANK[min];
}
