import NextAuth, { type NextAuthResult } from "next-auth";
import { authConfig } from "./auth.config";

// Edge middleware reads the JWT and enforces the `authorized` callback (auth.config.ts).
// Typed explicitly off NextAuthResult to avoid TS2742 with hoisted next-auth.
export const middleware: NextAuthResult["auth"] = NextAuth(authConfig).auth;

export const config = {
  // Run on everything except Next internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
