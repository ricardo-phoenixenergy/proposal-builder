// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Anthropic wrapper so handlers never hit the network or need a key.
vi.mock("../server/anthropic", () => ({
  anthropicCreateMessage: vi.fn(async () =>
    JSON.stringify({ heading: "Generated heading", body: "Generated body within limits." }),
  ),
}));

import { setOwnerResolverForTests } from "../server/auth/owner";
import { POST as generateSection } from "../../app/api/generate/section/route";
import { POST as generateProposal } from "../../app/api/generate/proposal/route";

beforeEach(() => setOwnerResolverForTests(async () => "owner_local"));
afterEach(() => setOwnerResolverForTests(null));

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/generate/section", () => {
  it("400s on a malformed body", async () => {
    const res = await generateSection(post("http://x/api/generate/section", { type: "executive_summary" }));
    expect(res.status).toBe(400);
  });

  it("422s for a data-category type (use grid/import)", async () => {
    const res = await generateSection(
      post("http://x/api/generate/section", { type: "commercial_comparison", brief: "x" }),
    );
    expect(res.status).toBe(422);
  });

  it("returns generated data + validation for a text section", async () => {
    const res = await generateSection(
      post("http://x/api/generate/section", { type: "executive_summary", brief: "Solar for Acme" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { heading: string }; validation: { valid: boolean } };
    expect(body.data.heading).toBe("Generated heading");
    expect(body.validation.valid).toBe(true);
  });
});

describe("POST /api/generate/proposal (SSE)", () => {
  it("streams a section event per text type and a final done event", async () => {
    const res = await generateProposal(
      post("http://x/api/generate/proposal", {
        brief: "Solar for Acme",
        types: ["text", "executive_summary", "commercial_comparison"], // data type is skipped
      }),
    );
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    const sectionEvents = text.match(/event: section/g) ?? [];
    expect(sectionEvents).toHaveLength(2); // text + executive_summary, not the comparison
    expect(text).toContain("event: done");
  });
});
