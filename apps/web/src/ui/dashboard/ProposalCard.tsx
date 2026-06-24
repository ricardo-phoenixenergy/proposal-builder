"use client";

import { useState } from "react";
import type { ProposalSummary } from "../../client/persistence";
import type { Folder } from "../../client/folders";

function ago(iso: string): string {
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return "";
  const days = Math.floor((Date.now() - d) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

export function ProposalCard({
  proposal,
  folders,
  onDownload,
  onDuplicate,
  onRename,
  onMove,
  onDelete,
}: {
  proposal: ProposalSummary;
  folders: Folder[];
  onDownload: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, current: string) => void;
  onMove: (id: string, folderId: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const folderName = proposal.folderId
    ? (folders.find((f) => f.id === proposal.folderId)?.name ?? "—")
    : "Unfiled";

  return (
    <li data-proposal={proposal.id} className="pcard">
      <div className="pcard__body">
        <span className="pcard__title">{proposal.title}</span>
        <span className="pcard__client">{proposal.client || "—"}</span>
        <span className="pcard__meta">edited {ago(proposal.updatedAt)}</span>
        <span className="tag">{folderName}</span>
      </div>
      <div className="pcard__actions">
        <a className="btn btn--primary" href={`/p/${proposal.id}`}>
          Open
        </a>
        <button
          type="button"
          className="btn"
          aria-label="Download"
          onClick={() => onDownload(proposal.id)}
        >
          ⬇
        </button>
        <button
          type="button"
          className="btn"
          aria-label="More actions"
          onClick={() => setMenu((m) => !m)}
        >
          ⋯
        </button>
      </div>
      {menu ? (
        <div className="pcard__menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false);
              onDuplicate(proposal.id);
            }}
          >
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false);
              onRename(proposal.id, proposal.title);
            }}
          >
            Rename
          </button>
          <div className="pcard__submenu">
            <span className="pcard__submenu-label">Move to</span>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                onMove(proposal.id, null);
              }}
            >
              Unfiled
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  onMove(proposal.id, f.id);
                }}
              >
                {f.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            className="pcard__danger"
            onClick={() => {
              setMenu(false);
              onDelete(proposal.id);
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </li>
  );
}
