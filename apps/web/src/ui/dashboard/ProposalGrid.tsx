"use client";

import type { ProposalSummary } from "../../client/persistence";
import type { Folder } from "../../client/folders";
import { ProposalCard } from "./ProposalCard";

export function ProposalGrid({
  proposals,
  folders,
  handlers,
}: {
  proposals: ProposalSummary[];
  folders: Folder[];
  handlers: {
    onDownload: (id: string) => void;
    onDuplicate: (id: string) => void;
    onRename: (id: string, current: string) => void;
    onMove: (id: string, folderId: string | null) => void;
    onDelete: (id: string) => void;
  };
}) {
  if (proposals.length === 0) {
    return <p className="dash__empty">No matches.</p>;
  }
  return (
    <ul className="pgrid">
      {proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} folders={folders} {...handlers} />
      ))}
    </ul>
  );
}
