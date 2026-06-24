// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Anthropic wrapper so handlers never hit the network or need a key.
vi.mock("../server/anthropic", () => ({
  anthropicCreateMessage: vi.fn(),
}));

import { setOwnerResolverForTests } from "../server/auth/owner";
import { anthropicCreateMessage } from "../server/anthropic";
import { POST as generateSection } from "../../app/api/generate/section/route";
import { POST as generateProposal } from "../../app/api/generate/proposal/route";

const OK_JSON = JSON.stringify({
  heading: "Generated heading",
  body: "Generated body within limits.",
});

beforeEach(() => {
  setOwnerResolverForTests(async () => "owner_local");
  // Default: every section generates successfully. Tests override per-case.
  vi.mocked(anthropicCreateMessage).mockReset().mockResolvedValue(OK_JSON);
});
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
    const res = await generateSection(
      post("http://x/api/generate/section", { type: "executive_summary" }),
    );
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
    const body = (await res.json()) as {
      data: { heading: string };
      validation: { valid: boolean };
    };
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

  it("generates sections concurrently but caps in-flight calls at 5 (M-3)", async () => {
    let inFlight = 0;
    let peak = 0;
    const release: Array<(v: string) => void> = [];
    vi.mocked(anthropicCreateMessage).mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          release.push((v) => {
            inFlight--;
            resolve(v);
          });
        }),
    );

    // 7 text sections with a cap of 5 → first 5 dispatch immediately, 2 queue.
    const res = await generateProposal(
      post("http://x/api/generate/proposal", { brief: "b", types: Array(7).fill("text") }),
    );
    let finished = false;
    const done = res.text().then((t) => {
      finished = true;
      return t;
    });

    // Pump macrotasks, releasing every pending call each tick, until the stream
    // closes. The pool refills freed slots, so `peak` records true max concurrency.
    for (let guard = 0; guard < 200 && !finished; guard++) {
      await new Promise((r) => setTimeout(r, 0));
      while (release.length) release.shift()!(OK_JSON);
    }
    const text = await done;

    expect(peak).toBe(5); // parallel (>1) AND capped (never exceeds 5)
    expect(vi.mocked(anthropicCreateMessage)).toHaveBeenCalledTimes(7);
    expect((text.match(/event: section/g) ?? []).length).toBe(7);
    expect(text).toContain("event: done");
  });

  it("isolates a failed section: the rest still emit and 'done' is sent (M-3)", async () => {
    let n = 0;
    vi.mocked(anthropicCreateMessage).mockImplementation(async () => {
      n++;
      if (n === 1) throw new Error("upstream boom");
      return OK_JSON;
    });

    const res = await generateProposal(
      post("http://x/api/generate/proposal", {
        brief: "b",
        types: ["text", "executive_summary", "pricing_capex"],
      }),
    );
    const text = await res.text();

    expect((text.match(/event: section/g) ?? []).length).toBe(2);
    expect((text.match(/event: error/g) ?? []).length).toBe(1);
    expect(text).toContain("event: done");
  });
});
