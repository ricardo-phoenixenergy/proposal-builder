import type { ProposalDocument } from "@proposal/shared";

export interface ProposalSummary {
  id: string;
  title: string;
  client: string;
  folderId: string | null;
  updatedAt: string;
}

/** Client → backend persistence calls (§10.2). The browser never touches the DB. */
export async function createProposal(
  document: ProposalDocument,
  folderId: string | null = null,
): Promise<{ id: string; document: ProposalDocument }> {
  const res = await fetch("/api/proposals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ document, folderId }),
  });
  if (!res.ok) throw new Error(`Create failed (${res.status})`);
  const body = (await res.json()) as { proposal: { id: string; document: ProposalDocument } };
  return { id: body.proposal.id, document: body.proposal.document };
}

export async function updateProposalMeta(
  id: string,
  patch: { title?: string; folderId?: string | null },
): Promise<ProposalSummary> {
  const res = await fetch(`/api/proposals/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Update failed (${res.status})`);
  return ((await res.json()) as { proposal: ProposalSummary }).proposal;
}

export async function duplicateProposal(id: string): Promise<ProposalSummary> {
  const res = await fetch(`/api/proposals/${id}/duplicate`, { method: "POST" });
  if (!res.ok) throw new Error(`Duplicate failed (${res.status})`);
  return ((await res.json()) as { proposal: ProposalSummary }).proposal;
}

export async function deleteProposal(id: string): Promise<void> {
  const res = await fetch(`/api/proposals/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

/** Export to PDF and trigger a browser download. */
export async function downloadProposalPdf(id: string): Promise<void> {
  const res = await fetch(`/api/proposals/${id}/export`, { method: "POST" });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `proposal-${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function saveProposal(id: string, document: ProposalDocument): Promise<void> {
  const res = await fetch(`/api/proposals/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(document),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
}

export async function loadProposal(id: string): Promise<ProposalDocument> {
  const res = await fetch(`/api/proposals/${id}`);
  if (!res.ok) throw new Error(`Load failed (${res.status})`);
  const body = (await res.json()) as { proposal: { document: ProposalDocument } };
  return body.proposal.document;
}

export async function listProposals(): Promise<ProposalSummary[]> {
  const res = await fetch("/api/proposals");
  if (!res.ok) throw new Error(`List failed (${res.status})`);
  return ((await res.json()) as { proposals: ProposalSummary[] }).proposals;
}

export async function snapshotVersion(id: string): Promise<void> {
  const res = await fetch(`/api/proposals/${id}/versions`, { method: "POST" });
  if (!res.ok) throw new Error(`Snapshot failed (${res.status})`);
}
