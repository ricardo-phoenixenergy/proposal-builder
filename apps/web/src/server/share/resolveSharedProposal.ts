import { getRepo } from "../repo";
import { isShareLinkUsable } from "./shareLink";
import type { ShareLink, StoredProposal } from "../repo/types";

/**
 * Resolve a public share token to its proposal, applying every gate a client view
 * must pass: the link must exist, be live (not revoked / not expired), and point at
 * a proposal that still exists and is NOT trashed. Returns null on any failure so
 * the caller answers a uniform "unavailable" without leaking which gate failed.
 */
export async function resolveSharedProposal(
  token: string,
): Promise<{ link: ShareLink; proposal: StoredProposal } | null> {
  const link = await getRepo().getShareLink(token);
  if (!link || !isShareLinkUsable(link)) return null;
  const proposal = await getRepo().getProposal(link.proposalId);
  if (!proposal || proposal.deletedAt !== null) return null;
  return { link, proposal };
}
