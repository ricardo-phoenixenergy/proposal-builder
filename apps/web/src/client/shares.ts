/** Client API for proposal share links (2b). Mirrors the server ShareLink shape. */
export interface ShareLink {
  token: string;
  proposalId: string;
  allowExport: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  lastViewedAt: string | null;
  createdAt: string;
}

/** Absolute URL a client opens to view a shared proposal. */
export function shareUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/share/${token}`;
}

export async function listShares(proposalId: string): Promise<ShareLink[]> {
  const res = await fetch(`/api/proposals/${proposalId}/shares`);
  if (!res.ok) throw new Error(`Couldn't load links (${res.status})`);
  return ((await res.json()) as { links: ShareLink[] }).links;
}

export async function createShare(
  proposalId: string,
  opts?: { allowExport?: boolean; expiresAt?: string | null },
): Promise<ShareLink> {
  const res = await fetch(`/api/proposals/${proposalId}/shares`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opts ?? {}),
  });
  if (!res.ok) throw new Error(`Couldn't create link (${res.status})`);
  return ((await res.json()) as { link: ShareLink }).link;
}

export async function revokeShare(proposalId: string, token: string): Promise<void> {
  const res = await fetch(`/api/proposals/${proposalId}/shares/${token}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Couldn't revoke link (${res.status})`);
}
