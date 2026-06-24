// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests } from "../server/repo";
import { getLayout, resetLayoutsForTests, type SectionLayout } from "@proposal/shared";
import {
  getMergedLayouts,
  refreshActiveLayouts,
  invalidateActiveLayouts,
} from "../server/registry/activeLayouts";

const layout: SectionLayout = {
  type: "cover",
  variant: "cover",
  pageFormat: "a4_portrait",
  name: "Cover",
  root: { kind: "stack", children: [] },
  version: 1,
};

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  resetLayoutsForTests();
  invalidateActiveLayouts();
});
afterEach(() => {
  setRepoForTests(null);
  resetLayoutsForTests();
  invalidateActiveLayouts();
});

describe("activeLayouts registry", () => {
  it("refresh loads DB rows into the shared registry", async () => {
    await (await import("../server/repo")).getRepo().upsertSectionLayout(layout);
    await refreshActiveLayouts();
    expect(getLayout("cover", "cover", "a4_portrait")?.name).toBe("Cover");
  });

  it("getMergedLayouts caches; invalidate forces a re-read", async () => {
    const repo = (await import("../server/repo")).getRepo();
    await repo.upsertSectionLayout(layout);
    expect((await getMergedLayouts()).length).toBe(1);

    await repo.upsertSectionLayout({ ...layout, variant: "hero" });
    expect((await getMergedLayouts()).length).toBe(1); // cached
    invalidateActiveLayouts();
    expect((await getMergedLayouts()).length).toBe(2); // re-read
  });
});
