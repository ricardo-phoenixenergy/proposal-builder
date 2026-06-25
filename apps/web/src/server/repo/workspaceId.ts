/**
 * Deterministic id of a user's personal workspace (Theme 1, auto-personal model).
 * Personal workspaces are 1:1 with a user, so deriving the id from the user id
 * keeps the backfill migration and the write paths lookup-free. Shared workspaces
 * (a later slice) get random ids and explicit membership instead.
 */
export function personalWorkspaceId(userId: string): string {
  return `ws_${userId}`;
}
