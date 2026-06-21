// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isValidEmail } from "../server/auth/email";

describe("isValidEmail (minimal shape check)", () => {
  it("accepts a normal address", () => {
    expect(isValidEmail("owner@company.com")).toBe(true);
    expect(isValidEmail("a@b")).toBe(true); // no dot required — minimal check
  });
  it("rejects empty local or domain, missing @, doubled @, or whitespace", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("nobody")).toBe(false);
    expect(isValidEmail("@b.com")).toBe(false);
    expect(isValidEmail("a@")).toBe(false);
    expect(isValidEmail("a@b@c")).toBe(false);
    expect(isValidEmail("a b@c")).toBe(false);
  });
});
