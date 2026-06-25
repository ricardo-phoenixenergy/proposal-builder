import { describe, expect, it } from "vitest";
import { isShareLinkUsable, mintShareToken } from "../server/share/shareLink";
import type { ShareLink } from "../server/repo/types";

const base: ShareLink = {
  token: "shr_test",
  proposalId: "prop_1",
  workspaceId: "ws_1",
  createdBy: "user_1",
  allowExport: true,
  expiresAt: null,
  revokedAt: null,
  lastViewedAt: null,
  createdAt: "2026-06-25T00:00:00.000Z",
};

describe("isShareLinkUsable", () => {
  const now = new Date("2026-06-25T12:00:00.000Z");

  it("a fresh, non-expiring, non-revoked link is usable", () => {
    expect(isShareLinkUsable(base, now)).toBe(true);
  });

  it("a revoked link is never usable, even before its expiry", () => {
    const link = { ...base, revokedAt: "2026-06-25T01:00:00.000Z", expiresAt: null };
    expect(isShareLinkUsable(link, now)).toBe(false);
  });

  it("an expired link is not usable", () => {
    const link = { ...base, expiresAt: "2026-06-25T11:59:59.000Z" };
    expect(isShareLinkUsable(link, now)).toBe(false);
  });

  it("a link expiring in the future is usable", () => {
    const link = { ...base, expiresAt: "2026-06-26T00:00:00.000Z" };
    expect(isShareLinkUsable(link, now)).toBe(true);
  });

  it("expiry exactly at now is treated as expired (boundary is inclusive)", () => {
    const link = { ...base, expiresAt: now.toISOString() };
    expect(isShareLinkUsable(link, now)).toBe(false);
  });
});

describe("mintShareToken", () => {
  it("produces an unguessable shr_-prefixed token with no dashes", () => {
    const token = mintShareToken();
    expect(token).toMatch(/^shr_[0-9a-f]{32}$/);
  });

  it("produces a distinct token each call", () => {
    expect(mintShareToken()).not.toBe(mintShareToken());
  });
});
