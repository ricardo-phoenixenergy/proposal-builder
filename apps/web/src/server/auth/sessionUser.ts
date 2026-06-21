export interface SessionUser {
  id: string;
  isAdmin: boolean;
}
export type SessionUserResolver = () => Promise<SessionUser | null>;

async function fromNextAuth(): Promise<SessionUser | null> {
  const { auth } = await import("../../../auth");
  const session = await auth();
  if (!session?.user?.id) return null;
  return { id: session.user.id, isAdmin: session.user.isAdmin === true };
}

let resolver: SessionUserResolver = fromNextAuth;

export function setSessionUserResolverForTests(next: SessionUserResolver | null): void {
  resolver = next ?? fromNextAuth;
}

export function getSessionUser(): Promise<SessionUser | null> {
  return resolver();
}
