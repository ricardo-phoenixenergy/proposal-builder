import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const KEYLEN = 64;
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/**
 * Hash a password with scrypt (§13.10), async so it never blocks the event loop
 * (H-7). Format: `salt:derivedKey` (both hex). Node's built-in scrypt — no
 * bcrypt/argon dependency.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEYLEN)).toString("hex");
  return `${salt}:${derived}`;
}

/** Constant-time verification of a password against a stored `salt:hash`. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await scryptAsync(password, salt, expected.length || KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
