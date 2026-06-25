import type { ShareLink } from "../repo/types";

/** Prefix for share tokens. They are the capability — anyone with the token may view. */
const SHARE_TOKEN_PREFIX = "shr_";

/**
 * Mint an unguessable share token. Uses a full UUID (122 bits) with the dashes
 * stripped so the token is URL-clean. The token IS the secret — it is never derived
 * from the proposal id, so it can't be guessed from a known proposal.
 */
export function mintShareToken(): string {
  return `${SHARE_TOKEN_PREFIX}${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Whether a share link may currently be used: it must not be revoked and, if it
 * carries an expiry, that expiry must be in the future. Pure so the route and the
 * public viewer share one definition of "live".
 */
export function isShareLinkUsable(link: ShareLink, at: Date = new Date()): boolean {
  if (link.revokedAt !== null) return false;
  if (link.expiresAt !== null && Date.parse(link.expiresAt) <= at.getTime()) return false;
  return true;
}
