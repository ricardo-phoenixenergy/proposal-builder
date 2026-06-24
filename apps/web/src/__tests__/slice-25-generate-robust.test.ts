import { describe, expect, it, vi } from "vitest";
import {
  setActiveSectionTypes,
  resetSectionTypesForTests,
  type SectionTypeSchema,
} from "@proposal/shared";
import { generateSection, type CreateMessageFn } from "../server/generateSection";

const cover: SectionTypeSchema = {
  type: "cover",
  label: "Cover",
  category: "text",
  fields: [{ key: "title", type: "text", maxChars: 80 }],
  variants: [],
  schemaVersion: 1,
};

describe("generateSection robustness", () => {
  it("passes a maxOutputTokens derived from the schema to the create fn", async () => {
    resetSectionTypesForTests();
    setActiveSectionTypes([cover]);
    const create = vi.fn(async () => '{"title":"Hi"}') as unknown as CreateMessageFn;
    await generateSection({ type: "cover", brief: "b" }, create);
    const arg = (create as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as {
      maxOutputTokens?: number;
    };
    expect(typeof arg.maxOutputTokens).toBe("number");
    expect(arg.maxOutputTokens).toBeGreaterThanOrEqual(1024);
    resetSectionTypesForTests();
  });

  it("surfaces a friendly error when the create fn throws (e.g. length limit)", async () => {
    resetSectionTypesForTests();
    setActiveSectionTypes([cover]);
    const create = (async () => {
      throw new Error(
        "The response hit the length limit. Shorten the brief or reduce the section's fields, then retry.",
      );
    }) as unknown as CreateMessageFn;
    const res = await generateSection({ type: "cover", brief: "b" }, create);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/length limit/i);
    resetSectionTypesForTests();
  });
});
