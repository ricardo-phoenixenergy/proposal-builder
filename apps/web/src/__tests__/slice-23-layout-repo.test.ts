// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import type { SectionLayout } from "@proposal/shared";

const layout = (variant: string, pageFormat = "a4_portrait"): SectionLayout => ({
  type: "cover", variant, pageFormat, name: variant, root: { kind: "stack", children: [] }, version: 1,
});

describe("memory repo — section layouts", () => {
  it("upserts, lists, overwrites by identity, and deletes", async () => {
    const repo = createMemoryRepo();
    expect(await repo.listSectionLayouts()).toEqual([]);

    await repo.upsertSectionLayout(layout("cover"));
    await repo.upsertSectionLayout(layout("hero", "widescreen_16_9"));
    expect((await repo.listSectionLayouts()).length).toBe(2);

    // overwrite same (type,variant,pageFormat) → still 2, name updated
    await repo.upsertSectionLayout({ ...layout("cover"), name: "Cover v2" });
    const all = await repo.listSectionLayouts();
    expect(all.length).toBe(2);
    expect(all.find((l) => l.variant === "cover")!.name).toBe("Cover v2");

    // delete
    expect(await repo.deleteSectionLayout("cover", "cover", "a4_portrait")).toBe(true);
    expect(await repo.deleteSectionLayout("cover", "cover", "a4_portrait")).toBe(false); // already gone
    expect((await repo.listSectionLayouts()).map((l) => l.variant)).toEqual(["hero"]);
  });
});
