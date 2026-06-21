// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { getActiveModel } from "../server/aiModel";

beforeEach(() => setRepoForTests(createMemoryRepo()));
afterEach(() => setRepoForTests(null));

describe("AI model setting", () => {
  it("is null until set", async () => {
    expect(await getRepo().getAiModel()).toBeNull();
  });

  it("round-trips a selectable model", async () => {
    await getRepo().setAiModel("claude-sonnet-4-6");
    expect(await getRepo().getAiModel()).toBe("claude-sonnet-4-6");
  });

  it("getActiveModel falls back to the default when unset", async () => {
    expect(await getActiveModel()).toBe("claude-opus-4-8");
  });

  it("getActiveModel returns the set value", async () => {
    await getRepo().setAiModel("claude-haiku-4-5");
    expect(await getActiveModel()).toBe("claude-haiku-4-5");
  });
});
