// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { sampleProposal, defaultMapping } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import type { Repository } from "../server/repo/types";

void defaultMapping; // (keep import surface stable)

let repo: Repository;
beforeEach(() => {
  repo = createMemoryRepo();
});

describe("in-memory repository — proposals", () => {
  it("creates, lists, gets, autosaves, and deletes a proposal", async () => {
    const created = await repo.createProposal("owner_1", sampleProposal);
    expect(created.id).toBeTruthy();
    expect(created.ownerId).toBe("owner_1");

    const list = await repo.listProposals("owner_1");
    expect(list.map((p) => p.id)).toContain(created.id);
    expect(list[0]!.title).toBe(sampleProposal.title);

    const fetched = await repo.getProposal(created.id);
    expect(fetched?.document.title).toBe(sampleProposal.title);

    const edited = { ...sampleProposal, title: "Edited title" };
    const saved = await repo.saveProposal(created.id, edited);
    expect(saved?.document.title).toBe("Edited title");
    expect((await repo.getProposal(created.id))?.document.title).toBe("Edited title");

    // delete is now a soft-delete (4a): hidden from the active list, recoverable.
    expect(await repo.deleteProposal(created.id)).toBe(true);
    expect((await repo.listProposals("owner_1")).map((p) => p.id)).not.toContain(created.id);
    expect((await repo.getProposal(created.id))?.deletedAt).toBeTruthy();
  });

  it("scopes the list by owner", async () => {
    await repo.createProposal("owner_a", sampleProposal);
    await repo.createProposal("owner_b", sampleProposal);
    expect(await repo.listProposals("owner_a")).toHaveLength(1);
  });

  it("returns null when saving an unknown proposal", async () => {
    expect(await repo.saveProposal("nope", sampleProposal)).toBeNull();
  });
});

describe("in-memory repository — versions (export snapshots)", () => {
  it("snapshots the current document as an immutable version", async () => {
    const created = await repo.createProposal("owner_1", sampleProposal);
    await repo.saveProposal(created.id, { ...sampleProposal, title: "v2" });

    const snap = await repo.snapshotVersion(created.id);
    expect(snap?.proposalId).toBe(created.id);
    expect(snap?.document.title).toBe("v2");

    const versions = await repo.listVersions(created.id);
    expect(versions).toHaveLength(1);

    // later edits don't mutate the captured version
    await repo.saveProposal(created.id, { ...sampleProposal, title: "v3" });
    expect((await repo.listVersions(created.id))[0]!.document.title).toBe("v2");
  });
});

describe("in-memory repository — themes & templates upsert", () => {
  it("upserts a theme by id and lists it", async () => {
    const tokens = { ...sampleTheme() };
    await repo.upsertTheme("owner_1", tokens);
    await repo.upsertTheme("owner_1", { ...tokens, name: "Renamed" });
    const themes = await repo.listThemes("owner_1");
    expect(themes).toHaveLength(1); // upsert, not duplicate
    expect(themes[0]!.tokens.name).toBe("Renamed");
  });
});

function sampleTheme() {
  return {
    id: "theme_x",
    name: "X",
    colors: {
      primary: "#000",
      accent: "#111",
      text: "#222",
      muted: "#333",
      surface: "#fff",
      line: "#eee",
    },
    fonts: { heading: "Inter", body: "Inter" },
    radius: 8,
    spacing: 1,
  };
}
