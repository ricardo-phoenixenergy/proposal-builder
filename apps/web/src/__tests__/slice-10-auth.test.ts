// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../server/auth/password";
import { authenticateUser } from "../server/auth/credentials";
import { mintRenderToken, verifyRenderToken } from "../server/auth/renderToken";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-do-not-ship";
  setRepoForTests(createMemoryRepo());
});
afterEach(() => setRepoForTests(null));

describe("password hashing (scrypt, no plaintext at rest)", () => {
  it("verifies a correct password and rejects a wrong one", () => {
    const hash = hashPassword("correct horse");
    expect(hash).not.toContain("correct horse"); // not stored in the clear
    expect(verifyPassword("correct horse", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt) but both verify", () => {
    const a = hashPassword("pw");
    const b = hashPassword("pw");
    expect(a).not.toBe(b);
    expect(verifyPassword("pw", a)).toBe(true);
    expect(verifyPassword("pw", b)).toBe(true);
  });
});

describe("authenticateUser — DB-backed credentials (§13.10)", () => {
  it("returns the user for a stored email + correct password", async () => {
    const created = await getRepo().createUser({
      email: "Owner@Phoenix.test",
      passwordHash: hashPassword("hunter2"),
    });
    const user = await authenticateUser("owner@phoenix.test", "hunter2"); // case-insensitive email
    expect(user?.id).toBe(created.id);
    expect(user?.email).toBe("owner@phoenix.test");
  });

  it("rejects a wrong password", async () => {
    await getRepo().createUser({
      email: "owner@phoenix.test",
      passwordHash: hashPassword("hunter2"),
    });
    expect(await authenticateUser("owner@phoenix.test", "nope")).toBeNull();
  });

  it("rejects an unknown email (no account)", async () => {
    expect(await authenticateUser("ghost@phoenix.test", "anything")).toBeNull();
  });
});

describe("print render token — lets headless Chromium load /print without a session", () => {
  it("round-trips a valid token for the matching proposal id", () => {
    expect(verifyRenderToken("prop_123", mintRenderToken("prop_123"))).toBe(true);
  });

  it("rejects a token minted for a different proposal", () => {
    expect(verifyRenderToken("prop_999", mintRenderToken("prop_123"))).toBe(false);
  });

  it("rejects a tampered or malformed token", () => {
    expect(verifyRenderToken("prop_123", mintRenderToken("prop_123") + "x")).toBe(false);
    expect(verifyRenderToken("prop_123", "garbage")).toBe(false);
  });

  it("rejects an expired token", () => {
    expect(verifyRenderToken("prop_123", mintRenderToken("prop_123", -1000))).toBe(false);
  });
});
