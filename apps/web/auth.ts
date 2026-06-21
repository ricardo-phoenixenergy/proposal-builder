import NextAuth, { type NextAuthResult } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { authenticateUser } from "./src/server/auth/credentials";

/**
 * Auth.js v5 (§13.10). Credentials auth against DB-backed, admin-created accounts
 * (see authenticateUser), JWT sessions (no DB adapter). Shared route-protection
 * and callbacks live in auth.config.ts (edge-safe); this Node instance adds the
 * provider, whose authorize() reads the users table + scrypt-verifies.
 *
 * The fields are typed explicitly off NextAuthResult: in a workspace where
 * next-auth is hoisted, the inferred types can't be named portably (TS2742).
 */
const nextAuth = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      authorize: async (credentials) => {
        const user = await authenticateUser(credentials?.email, credentials?.password);
        return user ? { id: user.id, email: user.email, isAdmin: user.isAdmin } : null;
      },
    }),
  ],
});

export const handlers: NextAuthResult["handlers"] = nextAuth.handlers;
export const signIn: NextAuthResult["signIn"] = nextAuth.signIn;
export const signOut: NextAuthResult["signOut"] = nextAuth.signOut;
export const auth: NextAuthResult["auth"] = nextAuth.auth;
