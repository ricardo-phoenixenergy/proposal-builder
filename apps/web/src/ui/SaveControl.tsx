"use client";

import { useProposalStore } from "../state/proposalStore";

const LABELS: Record<string, string> = {
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
  idle: "Saved",
};

/** Topbar: save the proposal to the backend, then show autosave status. */
export function SaveControl() {
  const proposalId = useProposalStore((s) => s.proposalId);
  const status = useProposalStore((s) => s.saveStatus);
  const persistNew = useProposalStore((s) => s.persistNew);

  if (!proposalId) {
    return (
      <button
        type="button"
        className="btn"
        disabled={status === "saving"}
        onClick={() => void persistNew()}
      >
        {status === "saving" ? "Saving…" : "Save to cloud"}
      </button>
    );
  }
  return (
    <span className="meter" aria-label="save status">
      {LABELS[status] ?? "Saved"}
    </span>
  );
}
