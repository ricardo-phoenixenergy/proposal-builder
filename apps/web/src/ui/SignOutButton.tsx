"use client";

import { signOut } from "next-auth/react";

/** Topbar sign-out (§13.10). Ends the session and returns to the sign-in page. */
export function SignOutButton() {
  return (
    <button type="button" className="btn btn--ghost" onClick={() => void signOut({ callbackUrl: "/signin" })}>
      Sign out
    </button>
  );
}
