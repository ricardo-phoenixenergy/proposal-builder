"use client";

import { useState } from "react";
import type { Folder } from "../../client/folders";
import { createFolder, renameFolder, deleteFolder } from "../../client/folders";
import { useProposalStore } from "../../state/proposalStore";
import { ConfirmDialog } from "../ConfirmDialog";
import { PromptDialog } from "../PromptDialog";

type Selected = string | null;

export function FolderSidebar({
  folders,
  counts,
  selected,
  onSelect,
  onChange,
}: {
  folders: Folder[];
  counts: { all: number; unfiled: number; trash?: number; byFolder: Record<string, number> };
  selected: Selected;
  onSelect: (s: Selected) => void;
  onChange: () => void | Promise<void>;
}) {
  const notify = useProposalStore((s) => s.notify);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [pendingRename, setPendingRename] = useState<Folder | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Folder | null>(null);

  const cls = (s: Selected) => `dash__folder${selected === s ? " dash__folder--active" : ""}`;

  return (
    <nav className="dash__sidebar" aria-label="Folders">
      <button type="button" className={cls("all")} onClick={() => onSelect("all")}>
        All <span className="dash__count">{counts.all}</span>
      </button>
      {folders.map((f) => (
        <div key={f.id} className="dash__folderrow">
          <button type="button" className={cls(f.id)} onClick={() => onSelect(f.id)}>
            {f.name} <span className="dash__count">{counts.byFolder[f.id] ?? 0}</span>
          </button>
          <button
            type="button"
            className="dash__folderedit"
            aria-label="Rename folder"
            title={`Rename ${f.name}`}
            onClick={() => setPendingRename(f)}
          >
            ✎
          </button>
          <button
            type="button"
            className="dash__folderdel"
            aria-label="Delete folder"
            title={`Delete ${f.name}`}
            onClick={() => setPendingDelete(f)}
          >
            🗑
          </button>
        </div>
      ))}
      <button type="button" className={cls(null)} onClick={() => onSelect(null)}>
        Unfiled <span className="dash__count">{counts.unfiled}</span>
      </button>
      <button type="button" className={cls("trash")} onClick={() => onSelect("trash")}>
        Trash <span className="dash__count">{counts.trash ?? 0}</span>
      </button>
      <button type="button" className="btn dash__addfolder" onClick={() => setPendingCreate(true)}>
        + New folder
      </button>
      {pendingCreate ? (
        <PromptDialog
          title="New folder"
          label="Folder name"
          confirmLabel="Create"
          onConfirm={(name) => {
            void (async () => {
              try {
                await createFolder(name);
                await onChange();
              } catch {
                notify("error", "Couldn't create the folder.");
              }
            })();
          }}
          onClose={() => setPendingCreate(false)}
        />
      ) : null}
      {pendingRename ? (
        <PromptDialog
          title="Rename folder"
          label="Folder name"
          defaultValue={pendingRename.name}
          confirmLabel="Rename"
          onConfirm={(name) => {
            void (async () => {
              try {
                await renameFolder(pendingRename.id, name);
                await onChange();
              } catch {
                notify("error", "Couldn't rename the folder.");
              }
            })();
          }}
          onClose={() => setPendingRename(null)}
        />
      ) : null}
      {pendingDelete ? (
        <ConfirmDialog
          title="Delete folder"
          message={`Delete folder "${pendingDelete.name}"? Its proposals move to Unfiled.`}
          confirmLabel="Delete"
          onConfirm={() => {
            void (async () => {
              try {
                await deleteFolder(pendingDelete.id);
                if (selected === pendingDelete.id) onSelect("all");
                await onChange();
              } catch {
                notify("error", "Couldn't delete the folder.");
              }
            })();
          }}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}
    </nav>
  );
}
