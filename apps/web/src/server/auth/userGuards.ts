import { getRepo } from "../repo";

/** Thrown when a user-management change violates a guardrail (mapped to 409 by routes). */
export class GuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardError";
  }
}

/**
 * Enforce the two user-management guardrails (§D), server-authoritatively:
 *  1. No self-lockout — you can't disable or demote your own account.
 *  2. Keep one active admin — no change may drop active admins (isAdmin && !disabled) to zero.
 * Resolves when the change is allowed (including when the target id is unknown —
 * the calling route turns the setter's null return into a 404).
 *
 * `actingAdminId` is assumed to be an already-authenticated, active admin: this
 * helper does NOT re-authenticate the actor — `requireAdmin` at the route layer does.
 */
export async function assertCanModify(
  actingAdminId: string,
  targetId: string,
  change: { disabled?: boolean; isAdmin?: boolean },
): Promise<void> {
  const demotesSelf = change.isAdmin === false;
  const disablesSelf = change.disabled === true;
  if (targetId === actingAdminId && (demotesSelf || disablesSelf)) {
    throw new GuardError("You can't disable or demote your own account");
  }

  const repo = getRepo();
  const target = await repo.getUserById(targetId);
  if (!target) return; // unknown id — let the route 404 it

  const removesActiveAdmin =
    target.isAdmin && !target.disabled && (change.isAdmin === false || change.disabled === true);
  if (removesActiveAdmin && (await repo.countActiveAdmins()) <= 1) {
    throw new GuardError("There must be at least one active admin");
  }
}
