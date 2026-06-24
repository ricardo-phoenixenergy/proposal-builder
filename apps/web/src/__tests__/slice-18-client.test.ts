// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestSectionGeneration, requestFieldGeneration } from "../client/generate";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("client generation", () => {
  it("posts a section rewrite with instruction and no model", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { heading: "H" } }) });
    const r = await requestSectionGeneration({
      type: "executive_summary",
      brief: "b",
      instruction: "i",
    });
    expect(r.ok).toBe(true);
    const sent = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(sent).toEqual({ type: "executive_summary", brief: "b", instruction: "i" });
  });

  it("posts a field rewrite and returns the value", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ value: "v" }) });
    const r = await requestFieldGeneration({
      type: "executive_summary",
      fieldKey: "heading",
      brief: "b",
      currentValue: "c",
    });
    expect(r.ok).toBe(true);
    expect(r.value).toBe("v");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/generate/field",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
