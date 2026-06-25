import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import type { Repository } from "../server/repo/types";

let repo: Repository;

beforeEach(() => {
  repo = createMemoryRepo();
});

describe("share-link repository (memory)", () => {
  it("mints a usable link with an unguessable token, export on by default", async () => {
    const link = await repo.createShareLink({
      proposalId: "prop_1",
      workspaceId: "ws_1",
      createdBy: "user_1",
    });
    expect(link.token).toMatch(/^shr_[0-9a-f]{32}$/);
    expect(link.allowExport).toBe(true);
    expect(link.revokedAt).toBeNull();
    expect(link.expiresAt).toBeNull();
    expect(await repo.getShareLink(link.token)).toEqual(link);
  });

  it("honours allowExport=false and an explicit expiry", async () => {
    const link = await repo.createShareLink({
      proposalId: "prop_1",
      workspaceId: "ws_1",
      createdBy: "user_1",
      allowExport: false,
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    expect(link.allowExport).toBe(false);
    expect(link.expiresAt).toBe("2030-01-01T00:00:00.000Z");
  });

  it("lists a proposal's links newest-first and isolates by proposal", async () => {
    const a = await repo.createShareLink({
      proposalId: "prop_1",
      workspaceId: "w",
      createdBy: "u",
    });
    const b = await repo.createShareLink({
      proposalId: "prop_1",
      workspaceId: "w",
      createdBy: "u",
    });
    await repo.createShareLink({ proposalId: "prop_2", workspaceId: "w", createdBy: "u" });
    const list = await repo.listShareLinks("prop_1");
    expect(list.map((l) => l.token)).toEqual([b.token, a.token]);
  });

  it("revokes a link once; a second revoke is a no-op false", async () => {
    const link = await repo.createShareLink({ proposalId: "p", workspaceId: "w", createdBy: "u" });
    expect(await repo.revokeShareLink(link.token)).toBe(true);
    expect((await repo.getShareLink(link.token))?.revokedAt).not.toBeNull();
    expect(await repo.revokeShareLink(link.token)).toBe(false);
  });

  it("revoking an unknown token returns false", async () => {
    expect(await repo.revokeShareLink("shr_nope")).toBe(false);
  });

  it("touch stamps lastViewedAt", async () => {
    const link = await repo.createShareLink({ proposalId: "p", workspaceId: "w", createdBy: "u" });
    expect(link.lastViewedAt).toBeNull();
    await repo.touchShareLink(link.token);
    expect((await repo.getShareLink(link.token))?.lastViewedAt).not.toBeNull();
  });
});
