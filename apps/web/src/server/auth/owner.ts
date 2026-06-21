import { getSessionUser, setSessionUserResolverForTests } from "./sessionUser";

/** The signed-in owner id, or null. Scopes every repo query. Derived from the session-user seam. */
export async function getOwner(): Promise<string | null> {
  return (await getSessionUser())?.id ?? null;
}

/** Back-compat test seam: set the owner by wrapping the session-user resolver. */
export function setOwnerResolverForTests(next: (() => Promise<string | null>) | null): void {
  if (!next) {
    setSessionUserResolverForTests(null);
    return;
  }
  setSessionUserResolverForTests(async () => {
    const id = await next();
    return id ? { id, isAdmin: false } : null;
  });
}
