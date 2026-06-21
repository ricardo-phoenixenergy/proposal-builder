export interface Folder {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
}

export async function fetchFolders(): Promise<Folder[]> {
  const res = await fetch("/api/folders");
  if (!res.ok) throw new Error(`Failed to load folders (${res.status})`);
  return ((await res.json()) as { folders: Folder[] }).folders;
}

export async function createFolder(name: string): Promise<Folder> {
  const res = await fetch("/api/folders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Create folder failed (${res.status})`);
  return ((await res.json()) as { folder: Folder }).folder;
}

export async function renameFolder(id: string, name: string): Promise<Folder> {
  const res = await fetch(`/api/folders/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Rename folder failed (${res.status})`);
  return ((await res.json()) as { folder: Folder }).folder;
}

export async function deleteFolder(id: string): Promise<void> {
  const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete folder failed (${res.status})`);
}
