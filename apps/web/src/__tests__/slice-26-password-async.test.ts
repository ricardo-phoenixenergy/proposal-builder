// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../server/auth/password";

describe("password hashing (async)", () => {
  it("round-trips a password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
  });

  it("returns false for a malformed stored value", async () => {
    expect(await verifyPassword("x", "not-a-valid-hash")).toBe(false);
  });
});
