// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { builtInTemplates, type Template } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { getMergedTemplates, invalidateActiveTemplates } from "../server/registry/activeTemplates";

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveTemplates();
});
afterEach(() => {
  setRepoForTests(null);
  invalidateActiveTemplates();
});

const authored: Template = {
  id: "tmpl_sales", name: "Sales", themeId: "theme_phoenix_default", locked: false,
  slots: [{ kind: "fixed", type: "text", lock: "open" }],
};

describe("active template registry", () => {
  it("includes built-ins and merges authored rows", async () => {
    await getRepo().upsertTemplate({ id: authored.id, template: authored, deprecated: false });
    invalidateActiveTemplates();
    const merged = await getMergedTemplates();
    expect(merged.map((t) => t.id)).toEqual(expect.arrayContaining([...builtInTemplates.map((t) => t.id), "tmpl_sales"]));
  });

  it("overlays deprecation onto a built-in via a null-template row", async () => {
    await getRepo().upsertTemplate({ id: builtInTemplates[0]!.id, template: null, deprecated: true });
    invalidateActiveTemplates();
    const merged = await getMergedTemplates();
    expect(merged.find((t) => t.id === builtInTemplates[0]!.id)?.deprecated).toBe(true);
  });
});
