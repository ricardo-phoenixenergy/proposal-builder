import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_MS = 2 * 60 * 1000; // a render token only needs to outlive one Chromium navigation

function secret(): string {
  return process.env.AUTH_SECRET ?? "dev-only-render-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/**
 * Mint a short-lived, signed token authorising a render of one proposal's /print
 * route. The export function passes it to headless Chromium, which has no user
 * session cookie — this is how /print stays non-public without blocking export.
 */
export function mintRenderToken(proposalId: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const exp = Date.now() + ttlMs;
  return `${exp}.${sign(`${proposalId}.${exp}`)}`;
}

/** Validate a render token against a proposal id: signature must match and not be expired. */
export function verifyRenderToken(proposalId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  const expected = sign(`${proposalId}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
