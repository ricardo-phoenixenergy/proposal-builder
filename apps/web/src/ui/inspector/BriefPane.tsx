"use client";
import { useProposalStore } from "../../state/proposalStore";

export function BriefPane() {
  const brief = useProposalStore((s) => s.document.brief);
  const setBrief = useProposalStore((s) => s.setBrief);
  return (
    /* Proposal brief: global generation context */
    <div className="group">
      <div className="group__title">Proposal brief</div>
      <div className="field">
        <textarea
          aria-label="brief"
          rows={3}
          value={brief ?? ""}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="What's this proposal about? (sent as context on every AI call)"
        />
      </div>
    </div>
  );
}
