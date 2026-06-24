"use client";

import { useEffect } from "react";
import { useProposalStore } from "../state/proposalStore";

/** One auto-dismissing notice. Errors linger longer than success/info. */
function ToastItem({ id, kind, message }: { id: number; kind: string; message: string }) {
  const dismiss = useProposalStore((s) => s.dismiss);
  useEffect(() => {
    const ttl = kind === "error" ? 8000 : 4000;
    const timer = setTimeout(() => dismiss(id), ttl);
    return () => clearTimeout(timer);
  }, [id, kind, dismiss]);

  return (
    <div className={`toast toast--${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span className="toast__msg">{message}</span>
      <button
        type="button"
        className="toast__close"
        aria-label="Dismiss notification"
        onClick={() => dismiss(id)}
      >
        ×
      </button>
    </div>
  );
}

/** Transient error/status surface (§13.10). Stacked, fixed, store-driven. */
export function Toast() {
  const notifications = useProposalStore((s) => s.notifications);
  if (notifications.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {notifications.map((n) => (
        <ToastItem key={n.id} id={n.id} kind={n.kind} message={n.message} />
      ))}
    </div>
  );
}
