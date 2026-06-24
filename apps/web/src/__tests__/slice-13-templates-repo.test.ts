// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { sampleProposal, type Template } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import type { Repository } from "../server/repo/types";

let repo: Repository;
beforeEach(() => {
  repo = createMemoryRepo();
});

const tmpl: Template = {
  id: "tmpl_sales",
  name: "Sales",
  themeId: "theme_phoenix_default",
  locked: false,
  slots: [{ kind: "fixed", type: "text", lock: "open" }],
};

describe("repo template rows", () => {
  it("upserts and lists authored template rows", async () => {
    await repo.upsertTemplate({ id: tmpl.id, template: tmpl, deprecated: false });
    const rows = await repo.listTemplateRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.template?.name).toBe("Sales");
    expect(rows[0]!.deprecated).toBe(false);
  });

  it("toggles deprecation, and overlays a built-in via a null-template row", async () => {
    await repo.upsertTemplate({ id: tmpl.id, template: tmpl, deprecated: false });
    expect((await repo.setTemplateDeprecated("tmpl_sales", true))?.deprecated).toBe(true);
    expect(await repo.setTemplateDeprecated("ghost", false)).toBeNull();

    const overlay = await repo.upsertTemplate({
      id: "tmpl_open",
      template: null,
      deprecated: true,
    });
    expect(overlay.template).toBeNull();
    expect(overlay.deprecated).toBe(true);
  });

  it("reports in-use template ids from stored proposals", async () => {
    await repo.createProposal("owner_a", sampleProposal);
    const ids = await repo.listInUseTemplateIds();
    expect(ids).toContain(sampleProposal.templateId);
  });
});
