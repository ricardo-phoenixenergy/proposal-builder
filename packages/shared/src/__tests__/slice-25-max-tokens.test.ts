import { describe, expect, it } from "vitest";
import { estimateMaxOutputTokens } from "../generation/maxTokens";
import type { SectionTypeSchema } from "../types/section";

const t = (fields: SectionTypeSchema["fields"]): SectionTypeSchema => ({
  type: "x", label: "X", category: "text", fields, variants: [], schemaVersion: 1,
});

describe("estimateMaxOutputTokens", () => {
  it("clamps tiny schemas up to the 1024 floor", () => {
    expect(estimateMaxOutputTokens(t([{ key: "title", type: "text", maxChars: 80 }]))).toBe(1024);
  });

  it("scales with the summed character budget of AI fields", () => {
    const big = estimateMaxOutputTokens(t([
      { key: "a", type: "paragraph", maxWords: 400 }, // ~2400 chars
      { key: "b", type: "paragraph", maxWords: 400 },
    ]));
    expect(big).toBeGreaterThan(1024);
    expect(big).toBeLessThanOrEqual(8192);
  });

  it("ignores non-AI (data/image) fields", () => {
    const withData = estimateMaxOutputTokens(t([
      { key: "p", type: "paragraph", maxWords: 100 },
      { key: "grid", type: "dataset", maxRows: 999 },
      { key: "logo", type: "image" },
    ]));
    const textOnly = estimateMaxOutputTokens(t([{ key: "p", type: "paragraph", maxWords: 100 }]));
    expect(withData).toBe(textOnly);
  });
});
