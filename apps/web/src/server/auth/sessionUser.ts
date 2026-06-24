export interface SessionUser {
  id: string;
  isAdmin: boolean;
}
export type SessionUserResolver = () => Promise<SessionUser | null>;

const ACTIVE_TTL_MS = 30_000;
const activeCache = new Map<string, { active: boolean; exp: number }>();

/** Drop a user's cached active-state so a disable takes effect immediately. */
export function invalidateUserActiveCache(id: string): void {
  activeCache.delete(id);
}
export function resetUserActiveCacheForTests(): void {
  activeCache.clear();
}

/** Is the account still active (exists and not disabled)? Cached ~30s. */
async function isActive(id: string): Promise<boolean> {
  const now = Date.now();
  const hit = activeCache.get(id);
  if (hit && hit.exp > now) return hit.active;
  const { getRepo } = await import("../repo");
  const user = await getRepo().getUserById(id);
  const active = !!user && !user.disabled;
  activeCache.set(id, { active, exp: now + ACTIVE_TTL_MS });
  return active;
}

async function fromNextAuth(): Promise<SessionUser | null> {
  const { auth } = await import("../../../auth");
  const session = await auth();
  if (!session?.user?.id) return null;
  if (!(await isActive(session.user.id))) return null; // revoked: disabled or deleted (H-5)
  return { id: session.user.id, isAdmin: session.user.isAdmin === true };
}

let resolver: SessionUserResolver = fromNextAuth;

export function setSessionUserResolverForTests(next: SessionUserResolver | null): void {
  resolver = next ?? fromNextAuth;
}

export function getSessionUser(): Promise<SessionUser | null> {
  return resolver();
}
