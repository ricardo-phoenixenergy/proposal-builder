import type { ProposalDocument } from "@proposal/shared";

export interface ProposalSummary {
  id: string;
  title: string;
  updatedAt: string;
}

/** Client → backend persistence calls (§10.2). The browser never touches the DB. */
export async function createProposal(document: ProposalDocument): Promise<{ id: string; document: ProposalDocument }> {
  const res = await fetch("/api/proposals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(document),
  });
  if (!res.ok) throw new Error(`Create failed (${res.status})`);
  const body = (await res.json()) as { proposal: { id: string; document: ProposalDocument } };
  return { id: body.proposal.id, document: body.proposal.document };
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
