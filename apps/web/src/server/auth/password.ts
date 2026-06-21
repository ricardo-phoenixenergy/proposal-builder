import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;

/**
 * Hash a password with scrypt (§13.10). Format: `salt:derivedKey` (both hex).
 * Node's built-in scrypt — no bcrypt/argon dependency. Passwords are never
 * stored in the clear; only this hash lands in the users table.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEYLEN).toString("hex");
  return `${salt}:${derived}`;
}

/** Constant-time verification of a password against a stored `salt:hash`. */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length || KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
