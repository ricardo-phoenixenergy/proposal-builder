// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { systemPrompt, sectionUserPrompt } from "../server/prompts";
import { generateSection, type CreateMessageFn } from "../server/generateSection";
import { getSectionType } from "@proposal/shared";

describe("prompts", () => {
  it("system prompt forbids markup and sets brand voice", () => {
    const sp = systemPrompt();
    expect(sp.toLowerCase()).toContain("voice");
    expect(sp.toLowerCase()).toMatch(/never|only/);
  });

  it("section prompt embeds the brief and the field limits", () => {
    const prompt = sectionUserPrompt(getSectionType("executive_summary")!, "Solar for Acme");
    expect(prompt).toContain("Solar for Acme");
    expect(prompt).toContain("150"); // body maxWords
    expect(prompt).toContain("40"); // heading maxChars
  });
});

const fakeCreate = (json: string): CreateMessageFn => vi.fn(async () => json);

describe("generateSection", () => {
  it("returns validated data for a well-formed text section", async () => {
    const create = fakeCreate(JSON.stringify({ heading: "Summary", body: "Concise and within limits." }));
    const result = await generateSection({ type: "executive_summary", brief: "x" }, create);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ heading: "Summary", body: "Concise and within limits." });
    expect(result.validation?.valid).toBe(true);
  });

  it("flags over-limit output via validation (does not silently pass)", async () => {
    const body = Array.from({ length: 200 }, () => "word").join(" ");
    const create = fakeCreate(JSON.stringify({ heading: "Summary", body }));
    const result = await generateSection({ type: "executive_summary", brief: "x" }, create);
    expect(result.ok).toBe(true);
    expect(result.validation?.valid).toBe(false);
    expect(result.validation?.errors.some((e) => e.path.includes("body"))).toBe(true);
  });

  it("errors on non-JSON model output", async () => {
    const result = await generateSection({ type: "executive_summary", brief: "x" }, fakeCreate("not json"));
    expect(result.ok).toBe(false);
  });

  it("rejects unknown section types", async () => {
    const result = await generateSection({ type: "nope", brief: "x" }, fakeCreate("{}"));
    expect(result.ok).toBe(false);
  });

  it("refuses AI draft for data-category sections (use grid/import)", async () => {
    const result = await generateSection({ type: "commercial_comparison", brief: "x" }, fakeCreate("{}"));
    expect(result.ok).toBe(false);
    expect(result.error?.toLowerCase()).toMatch(/grid|import|data/);
  });

  it("passes a model from the allowlist through and falls back to default otherwise", async () => {
    const create = vi.fn(async () => JSON.stringify({ heading: "H", body: "B" }));
    await generateSection({ type: "executive_summary", brief: "x", model: "claude-sonnet-4-6" }, create);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-sonnet-4-6" }));

    const create2 = vi.fn(async () => JSON.stringify({ heading: "H", body: "B" }));
    await generateSection({ type: "executive_summary", brief: "x", model: "gpt-4o" }, create2);
    expect(create2).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-opus-4-8" }));
  });
});
