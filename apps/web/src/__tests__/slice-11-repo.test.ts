// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { sampleProposal, type SectionTypeSchema } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import type { Repository } from "../server/repo/types";

let repo: Repository;
beforeEach(() => {
  repo = createMemoryRepo();
});

const def: SectionTypeSchema = {
  type: "case_study",
  label: "Case study",
  category: "text",
  fields: [{ key: "body", type: "paragraph", label: "Body", required: true }],
  variants: [],
  schemaVersion: 1,
};

describe("repo section-type rows", () => {
  it("upserts and lists authored types", async () => {
    await repo.upsertSectionType({ type: "case_study", definition: def, deprecated: false });
    const rows = await repo.listSectionTypeRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.definition?.label).toBe("Case study");
  });

  it("toggles deprecation", async () => {
    await repo.upsertSectionType({ type: "case_study", definition: def, deprecated: false });
    const updated = await repo.setSectionTypeDeprecated("case_study", true);
    expect(updated?.deprecated).toBe(true);
    expect(await repo.setSectionTypeDeprecated("ghost", false)).toBeNull();
  });

  it("can deprecate a built-in via a definition-null overlay row", async () => {
    const row = await repo.upsertSectionType({ type: "text", definition: null, deprecated: true });
    expect(row.definition).toBeNull();
    expect(row.deprecated).toBe(true);
  });

  it("reports in-use type keys from stored proposals", async () => {
    await repo.createProposal("owner_a", sampleProposal);
    const keys = await repo.listInUseTypeKeys();
    expect(keys).toContain(sampleProposal.sections[0]!.type);
  });
});
