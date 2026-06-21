/**
 * Minimal email-shape check (NOT RFC validation, per spec §E): exactly one "@",
 * non-empty local and domain parts, no whitespace. Stricter validation is
 * intentionally out of scope.
 */
export function isValidEmail(email: string): boolean {
  const t = email.trim();
  const at = t.indexOf("@");
  return at > 0 && at < t.length - 1 && !/\s/.test(t) && t.indexOf("@", at + 1) === -1;
}
