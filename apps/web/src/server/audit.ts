import { getRepo } from "./repo";
import { getOwner } from "./auth/owner";

/**
 * Record an audit event (Theme 3), attributing it to the acting user. Best-effort:
 * awaited so the write flushes before the serverless function freezes, but a failure
 * is swallowed (logged) so auditing never breaks the user's action. Skips silently
 * when there's no authenticated actor to attribute.
 */
export async function audit(event: {
  workspaceId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    const actorUserId = await getOwner();
    if (!actorUserId) return;
    await getRepo().recordAuditEvent({ ...event, actorUserId });
  } catch (e) {
    console.error("[audit] failed to record", event.action, e);
  }
}
