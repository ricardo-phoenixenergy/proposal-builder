"use client";

import { useState } from "react";
import type { ProposalSummary } from "../../client/persistence";
import { ConfirmDialog } from "../ConfirmDialog";

/**
 * The trash (4b): soft-deleted proposals, each restorable or permanently
 * deletable. Presentational — the Dashboard owns the data + persistence calls.
 */
export function TrashView({
  proposals,
  onRestore,
  onPurge,
}: {
  proposals: ProposalSummary[];
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
}) {
  const [pendingPurge, setPendingPurge] = useState<ProposalSummary | null>(null);

  if (proposals.length === 0) {
    return (
      <div className="dash__empty">
        <p>Trash is empty.</p>
        <p className="dash__hint">Deleted proposals are kept here for 30 days, then removed.</p>
      </div>
    );
  }

  return (
    <>
      <ul className="pcard-grid">
        {proposals.map((p) => (
          <li key={p.id} data-trashed={p.id} className="pcard pcard--trashed">
            <div className="pcard__body">
              <span className="pcard__title">{p.title}</span>
              <span className="pcard__client">{p.client || "—"}</span>
            </div>
            <div className="pcard__actions">
              <button type="button" className="btn" onClick={() => onRestore(p.id)}>
                Restore
              </button>
              <button
                type="button"
                className="btn pcard__danger"
                onClick={() => setPendingPurge(p)}
              >
                Delete forever
              </button>
            </div>
          </li>
        ))}
      </ul>
      {pendingPurge ? (
        <ConfirmDialog
          title="Delete forever"
          message={`Permanently delete "${pendingPurge.title}"? This cannot be undone.`}
          confirmLabel="Delete permanently"
          onConfirm={() => onPurge(pendingPurge.id)}
          onClose={() => setPendingPurge(null)}
        />
      ) : null}
    </>
  );
}
