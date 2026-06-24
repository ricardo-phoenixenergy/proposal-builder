import { getRepo } from "../repo";
import { verifyPassword } from "./password";

/** The authenticated principal. `id` is what scopes every repo query (the owner). */
export interface AuthUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

/**
 * Verify a sign-in attempt against a DB-backed account (§13.10). Accounts are
 * admin-created (no public signup); passwords are scrypt-hashed at rest. Returns
 * the owner principal on success, null on unknown email or wrong password.
 */
export async function authenticateUser(
  email: unknown,
  password: unknown,
): Promise<AuthUser | null> {
  if (typeof email !== "string" || typeof password !== "string") return null;

  const user = await getRepo().getUserByEmail(email);
  if (!user) return null;
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  if (user.disabled) return null; // disabled accounts cannot sign in (§B)

  return { id: user.id, email: user.email, isAdmin: user.isAdmin };
}
