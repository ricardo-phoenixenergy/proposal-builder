import type { NextAuthConfig } from "next-auth";

/** Paths reachable without a session. /print is authorised per-request by a signed
 *  render token (see renderToken.ts), so it stays out of the session gate. */
const PUBLIC_PREFIXES = ["/signin", "/api/auth", "/print"];

/**
 * Edge-safe Auth.js config shared by middleware and the Node auth instance.
 * Deliberately carries NO providers — the Credentials provider pulls node:crypto,
 * which can't run in the edge middleware. Middleware only needs to read the JWT.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (
        PUBLIC_PREFIXES.some(
          (p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p),
        )
      ) {
        return true;
      }
      if (pathname === "/admin" || pathname.startsWith("/admin/")) {
        return auth?.user?.isAdmin === true;
      }
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      if (user && "isAdmin" in user)
        token.isAdmin = (user as { isAdmin?: boolean }).isAdmin === true;
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.id === "string") session.user.id = token.id;
      if (session.user) session.user.isAdmin = token.isAdmin === true;
      return session;
    },
  },
} satisfies NextAuthConfig;
