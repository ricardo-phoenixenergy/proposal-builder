import type { UserSummary } from "../server/repo/types";

async function readError(res: Response, fallback: string): Promise<never> {
  const err = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(err.error ?? fallback);
}

export async function fetchUsers(): Promise<UserSummary[]> {
  const res = await fetch("/api/users");
  if (!res.ok) await readError(res, `Failed to load users (${res.status})`);
  return ((await res.json()) as { users: UserSummary[] }).users;
}

export async function createUser(input: { email: string; password: string; isAdmin: boolean }): Promise<UserSummary> {
  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) await readError(res, "Create failed");
  return ((await res.json()) as { user: UserSummary }).user;
}

export async function updateUser(id: string, change: { disabled?: boolean; isAdmin?: boolean }): Promise<UserSummary> {
  const res = await fetch(`/api/users/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(change),
  });
  if (!res.ok) await readError(res, "Update failed");
  return ((await res.json()) as { user: UserSummary }).user;
}

export async function setUserPassword(id: string, password: string): Promise<void> {
  const res = await fetch(`/api/users/${id}/password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) await readError(res, "Update failed");
}
