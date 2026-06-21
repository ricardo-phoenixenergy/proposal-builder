// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sectionRewritePrompt, fieldRewritePrompt } from "../server/prompts";
import { getSectionType } from "@proposal/shared";

describe("sectionRewritePrompt", () => {
  it("includes the brief, the instruction, and only text fields", () => {
    const t = getSectionType("executive_summary")!;
    const p = sectionRewritePrompt(t, "Solar for Acme", "Make it punchy");
    expect(p).toContain("Solar for Acme");
    expect(p).toContain("Make it punchy");
    expect(p).toContain("heading");
    expect(p).toContain("body");
  });
});

describe("fieldRewritePrompt", () => {
  it("includes the brief, the instruction, and the current value as context", () => {
    const field = getSectionType("executive_summary")!.fields[0]!;
    const p = fieldRewritePrompt(field, "Solar for Acme", "Shorter", "Old heading");
    expect(p).toContain("Solar for Acme");
    expect(p).toContain("Shorter");
    expect(p).toContain("Old heading");
    expect(p).toContain("value");
  });
});
