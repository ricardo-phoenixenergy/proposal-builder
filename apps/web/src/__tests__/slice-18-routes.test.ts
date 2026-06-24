// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/anthropic", () => ({
  anthropicCreateMessage: vi.fn(
    async (args: { schema: { properties: Record<string, unknown> } }) =>
      "value" in args.schema.properties
        ? JSON.stringify({ value: "One field" })
        : JSON.stringify({ heading: "H", body: "B" }),
  ),
}));

import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { POST as section } from "../../app/api/generate/section/route";
import { POST as field } from "../../app/api/generate/field/route";

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  setOwnerResolverForTests(async () => "owner_a");
});
afterEach(() => {
  setRepoForTests(null);
  setOwnerResolverForTests(null);
});

const post = (url: string, body: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/generate/section (instruction)", () => {
  it("returns text-field data", async () => {
    const res = await section(
      post("http://x/api/generate/section", {
        type: "executive_summary",
        brief: "x",
        instruction: "Punchy",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { heading: string } };
    expect(body.data.heading).toBe("H");
  });
});

describe("POST /api/generate/field", () => {
  it("returns one value", async () => {
    const res = await field(
      post("http://x/api/generate/field", {
        type: "executive_summary",
        fieldKey: "heading",
        brief: "x",
        currentValue: "old",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { value: string };
    expect(body.value).toBe("One field");
  });

  it("400s a non-AI field", async () => {
    const res = await field(
      post("http://x/api/generate/field", {
        type: "commercial_comparison",
        fieldKey: "matrix",
        brief: "x",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400s a malformed body", async () => {
    const res = await field(post("http://x/api/generate/field", { type: "executive_summary" }));
    expect(res.status).toBe(400);
  });
});
