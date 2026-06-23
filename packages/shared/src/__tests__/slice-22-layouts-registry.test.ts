import { afterEach, describe, expect, it } from "vitest";
import {
  setActiveLayouts, getLayout, listLayoutVariants, layoutsRevision, resetLayoutsForTests,
} from "../registry/layouts";
import type { SectionLayout } from "../types/layout";

const mk = (variant: string, pageFormat: string): SectionLayout => ({
  type: "cover", variant, pageFormat, name: variant, root: { kind: "stack", children: [] }, version: 1,
});

afterEach(() => resetLayoutsForTests());

describe("layouts registry", () => {
  it("get/list by (type, variant, format); absent format → a4_portrait default", () => {
    setActiveLayouts([mk("cover", "widescreen_16_9"), mk("hero", "a4_portrait")]);
    expect(getLayout("cover", "cover", "widescreen_16_9")?.name).toBe("cover");
    expect(getLayout("cover", "cover", "a4_portrait")).toBeUndefined();
    expect(getLayout("cover", "hero", undefined)?.name).toBe("hero"); // default format
    expect(listLayoutVariants("cover", "widescreen_16_9")).toEqual(["cover"]);
    expect(listLayoutVariants("cover", "a4_portrait")).toEqual(["hero"]);
  });

  it("bumps the revision on set/reset", () => {
    const r0 = layoutsRevision();
    setActiveLayouts([mk("cover", "a4_portrait")]);
    expect(layoutsRevision()).toBeGreaterThan(r0);
  });
});
