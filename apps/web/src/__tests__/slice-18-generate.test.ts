// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { generateSection } from "../server/generateSection";
import { generateField } from "../server/generateField";

const create = (json: string) => vi.fn(async () => json);

describe("generateSection with instruction (text fields only)", () => {
  it("returns only the text fields and respects the instruction path", async () => {
    const fn = create(JSON.stringify({ heading: "New", body: "Fresh copy." }));
    const r = await generateSection({ type: "executive_summary", brief: "x", instruction: "Punchy" }, fn);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ heading: "New", body: "Fresh copy." });
  });

  it("refuses a tabular-only section (no AI fields)", async () => {
    const r = await generateSection({ type: "commercial_comparison", brief: "x", instruction: "y" }, create("{}"));
    expect(r.ok).toBe(false);
    expect(r.error?.toLowerCase()).toMatch(/grid|import|data/);
  });
});

describe("generateField", () => {
  it("returns one field value", async () => {
    const r = await generateField(
      { type: "executive_summary", fieldKey: "heading", brief: "x", currentValue: "Old" },
      create(JSON.stringify({ value: "Shiny new heading" })),
    );
    expect(r.ok).toBe(true);
    expect(r.value).toBe("Shiny new heading");
  });

  it("flags an over-limit field via validation", async () => {
    const long = "x".repeat(100); // executive_summary.heading maxChars = 40
    const r = await generateField(
      { type: "executive_summary", fieldKey: "heading", brief: "x" },
      create(JSON.stringify({ value: long })),
    );
    expect(r.ok).toBe(true);
    expect(r.validation?.valid).toBe(false);
  });

  it("rejects a non-AI field", async () => {
    const r = await generateField({ type: "commercial_comparison", fieldKey: "matrix", brief: "x" }, create("{}"));
    expect(r.ok).toBe(false);
  });
});
