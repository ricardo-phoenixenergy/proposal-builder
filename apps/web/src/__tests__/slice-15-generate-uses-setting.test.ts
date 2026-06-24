// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMessage = vi.fn(async (_args: unknown) => JSON.stringify({ heading: "H", body: "B" }));
vi.mock("../server/anthropic", () => ({
  anthropicCreateMessage: (args: unknown) => createMessage(args),
}));

import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { POST as generateSection } from "../../app/api/generate/section/route";

beforeEach(() => {
  createMessage.mockClear();
  setRepoForTests(createMemoryRepo());
  setOwnerResolverForTests(async () => "owner_a");
});
afterEach(() => {
  setRepoForTests(null);
  setOwnerResolverForTests(null);
});

const post = (body: unknown) =>
  new Request("http://x/api/generate/section", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("generation uses the admin model setting", () => {
  it("uses the default when unset, ignoring a client-sent model", async () => {
    await generateSection(
      post({ type: "executive_summary", brief: "x", model: "claude-haiku-4-5" }),
    );
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-opus-4-8" }),
    );
  });

  it("uses the configured model when set", async () => {
    await getRepo().setAiModel("claude-sonnet-4-6");
    await generateSection(post({ type: "executive_summary", brief: "x" }));
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-sonnet-4-6" }),
    );
  });
});
