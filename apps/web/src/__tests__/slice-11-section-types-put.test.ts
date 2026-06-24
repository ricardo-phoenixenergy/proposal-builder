// apps/web/src/__tests__/slice-11-section-types-put.test.ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal, type SectionTypeSchema } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { invalidateActiveRegistry } from "../server/registry/activeRegistry";
import { PUT } from "../../app/api/section-types/[type]/route";

const def: SectionTypeSchema = {
  type: "case_study",
  label: "Case study",
  category: "text",
  fields: [{ key: "body", type: "paragraph", label: "Body", required: true }],
  variants: [],
  schemaVersion: 1,
};
const ctx = (type: string) => ({ params: Promise.resolve({ type }) });
const put = (body: unknown) =>
  new Request("http://x", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveRegistry();
  setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: true }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
  invalidateActiveRegistry();
});

describe("PUT /api/section-types/[type]", () => {
  it("edits a not-in-use authored type", async () => {
    await getRepo().upsertSectionType({ type: "case_study", definition: def, deprecated: false });
    const res = await PUT(put({ ...def, label: "Renamed" }), ctx("case_study"));
    expect(res.status).toBe(200);
    expect((await getRepo().listSectionTypeRows())[0]!.definition?.label).toBe("Renamed");
  });

  it("creates a same-key override when editing a not-in-use built-in", async () => {
    const res = await PUT(put({ ...def, type: "text", label: "Custom Text" }), ctx("text"));
    expect(res.status).toBe(200);
    const row = (await getRepo().listSectionTypeRows()).find((r) => r.type === "text");
    expect(row?.definition?.label).toBe("Custom Text");
  });

  it("409s editing an in-use built-in", async () => {
    await getRepo().createProposal("owner_a", {
      ...sampleProposal,
      sections: [{ id: "s1", type: "text", data: { heading: "x", body: "y" } }],
    });
    const res = await PUT(put({ ...def, type: "text", label: "Nope" }), ctx("text"));
    expect(res.status).toBe(409);
  });

  it("409s editing an in-use authored type", async () => {
    await getRepo().upsertSectionType({ type: "case_study", definition: def, deprecated: false });
    await getRepo().createProposal("owner_a", {
      ...sampleProposal,
      sections: [{ id: "s1", type: "case_study", data: { body: "x" } }],
    });
    const res = await PUT(put({ ...def, label: "Nope" }), ctx("case_study"));
    expect(res.status).toBe(409);
  });

  it("404s an unknown authored type", async () => {
    expect((await PUT(put(def), ctx("ghost"))).status).toBe(404);
  });
});
