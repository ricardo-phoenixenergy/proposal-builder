"use client";

import type { Folder } from "../../client/folders";
import { createFolder, renameFolder, deleteFolder } from "../../client/folders";
import { useProposalStore } from "../../state/proposalStore";

type Selected = "all" | null | string;

export function FolderSidebar({
  folders,
  counts,
  selected,
  onSelect,
  onChange,
}: {
  folders: Folder[];
  counts: { all: number; unfiled: number; byFolder: Record<string, number> };
  selected: Selected;
  onSelect: (s: Selected) => void;
  onChange: () => void | Promise<void>;
}) {
  const notify = useProposalStore((s) => s.notify);

  const add = async () => {
    const name = window.prompt("New folder name");
    if (name === null || name.trim() === "") return;
    try {
      await createFolder(name.trim());
      await onChange();
    } catch {
      notify("error", "Couldn't create the folder.");
    }
  };
  const rename = async (f: Folder) => {
    const name = window.prompt("Rename folder", f.name);
    if (name === null || name.trim() === "") return;
    try {
      await renameFolder(f.id, name.trim());
      await onChange();
    } catch {
      notify("error", "Couldn't rename the folder.");
    }
  };
  const remove = async (f: Folder) => {
    if (!window.confirm(`Delete folder "${f.name}"? Its proposals move to Unfiled.`)) return;
    try {
      await deleteFolder(f.id);
      if (selected === f.id) onSelect("all");
      await onChange();
    } catch {
      notify("error", "Couldn't delete the folder.");
    }
  };

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
            onClick={() => rename(f)}
          >
            ✎
          </button>
          <button
            type="button"
            className="dash__folderdel"
            aria-label="Delete folder"
            title={`Delete ${f.name}`}
            onClick={() => remove(f)}
          >
            🗑
          </button>
        </div>
      ))}
      <button type="button" className={cls(null)} onClick={() => onSelect(null)}>
        Unfiled <span className="dash__count">{counts.unfiled}</span>
      </button>
      <button type="button" className="btn dash__addfolder" onClick={add}>
        + New folder
      </button>
    </nav>
  );
}
