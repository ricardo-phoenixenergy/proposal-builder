"use client";

import { useMemo, useState } from "react";
import {
  listProposals,
  updateProposalMeta,
  duplicateProposal,
  deleteProposal,
  downloadProposalPdf,
  type ProposalSummary,
} from "../../client/persistence";
import type { Folder } from "../../client/folders";
import { fetchFolders } from "../../client/folders";
import { useProposalStore } from "../../state/proposalStore";
import { FolderSidebar } from "./FolderSidebar";
import { ProposalGrid } from "./ProposalGrid";
import { NewProposalDialog } from "./NewProposalDialog";

type Sort = "recent" | "title";

export function Dashboard({
  initialProposals,
  initialFolders,
  isAdmin,
}: {
  initialProposals: ProposalSummary[];
  initialFolders: Folder[];
  isAdmin: boolean;
}) {
  const notify = useProposalStore((s) => s.notify);
  const [proposals, setProposals] = useState(initialProposals);
  const [folders, setFolders] = useState(initialFolders);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [selectedFolderId, setSelectedFolderId] = useState<"all" | null | string>("all");
  const [showNew, setShowNew] = useState(false);

  const refresh = async () => {
    try {
      setProposals(await listProposals());
    } catch {
      notify("error", "Couldn't refresh proposals.");
    }
  };

  const refreshFolders = async () => {
    try {
      setFolders(await fetchFolders());
      setProposals(await listProposals());
    } catch {
      notify("error", "Couldn't refresh folders.");
    }
  };

  const counts = useMemo(() => ({
    all: proposals.length,
    unfiled: proposals.filter((p) => p.folderId === null).length,
    byFolder: folders.reduce<Record<string, number>>((acc, f) => {
      acc[f.id] = proposals.filter((p) => p.folderId === f.id).length;
      return acc;
    }, {}),
  }), [proposals, folders]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = proposals;
    if (selectedFolderId !== "all") {
      list = list.filter((p) => (selectedFolderId === null ? p.folderId === null : p.folderId === selectedFolderId));
    }
    if (q) list = list.filter((p) => p.title.toLowerCase().includes(q) || p.client.toLowerCase().includes(q));
    return [...list].sort((a, b) =>
      sort === "title" ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [proposals, search, sort, selectedFolderId]);

  const handlers = {
    onDownload: async (id: string) => {
      try {
        await downloadProposalPdf(id);
      } catch {
        notify("error", "Export failed.");
      }
    },
    onDuplicate: async (id: string) => {
      try {
        await duplicateProposal(id);
        await refresh();
        notify("success", "Duplicated.");
      } catch {
        notify("error", "Duplicate failed.");
      }
    },
    onRename: async (id: string, current: string) => {
      const title = window.prompt("Rename proposal", current);
      if (title === null || title.trim() === "") return;
      try {
        await updateProposalMeta(id, { title: title.trim() });
        await refresh();
      } catch {
        notify("error", "Rename failed.");
      }
    },
    onMove: async (id: string, folderId: string | null) => {
      try {
        await updateProposalMeta(id, { folderId });
        await refresh();
      } catch {
        notify("error", "Move failed.");
      }
    },
    onDelete: async (id: string) => {
      if (!window.confirm("Delete this proposal? This can't be undone.")) return;
      try {
        await deleteProposal(id);
        setProposals((prev) => prev.filter((p) => p.id !== id));
      } catch {
        notify("error", "Delete failed.");
      }
    },
  };

  return (
    <div className="dash">
      <header className="topbar">
        <span className="topbar__title">Proposal Generator</span>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {isAdmin ? <a className="btn btn--ghost" href="/admin">Admin</a> : null}
          <a className="btn btn--ghost" href="/api/auth/signout">Sign out</a>
        </div>
      </header>

      <div className="dash__toolbar">
        <input aria-label="Search title or client" placeholder="Search title or client…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="recent">Recent</option>
          <option value="title">Title A–Z</option>
        </select>
        <button type="button" className="btn btn--primary" onClick={() => setShowNew(true)}>+ New</button>
      </div>

      <div className="dash__body">
        <FolderSidebar folders={folders} counts={counts} selected={selectedFolderId} onSelect={setSelectedFolderId} onChange={refreshFolders} />
        <main className="dash__main">
          {proposals.length === 0 ? (
            <div className="dash__empty">
              <p>No proposals yet.</p>
              <button type="button" className="btn btn--primary" onClick={() => setShowNew(true)}>+ New proposal</button>
            </div>
          ) : (
            <ProposalGrid proposals={visible} folders={folders} handlers={handlers} />
          )}
        </main>
      </div>
      {showNew ? <NewProposalDialog folders={folders} onClose={() => setShowNew(false)} /> : null}
    </div>
  );
}
