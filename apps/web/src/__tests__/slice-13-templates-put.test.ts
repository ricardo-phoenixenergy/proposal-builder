// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { builtInTemplates, sampleProposal, type Template } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { invalidateActiveTemplates } from "../server/registry/activeTemplates";
import { invalidateActiveRegistry } from "../server/registry/activeRegistry";
import { PUT } from "../../app/api/templates/[id]/route";

const tmpl: Template = {
  id: "tmpl_sales",
  name: "Sales",
  themeId: "theme_phoenix_default",
  locked: false,
  slots: [{ kind: "fixed", type: "text", lock: "open" }],
};
const put = (id: string, body: unknown) => ({
  req: new Request(`http://x/api/templates/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }),
  ctx: { params: Promise.resolve({ id }) },
});

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveTemplates();
  invalidateActiveRegistry();
  setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: true }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
  invalidateActiveTemplates();
  invalidateActiveRegistry();
});

describe("PUT /api/templates/[id]", () => {
  it("edits an authored, not-in-use template", async () => {
    await getRepo().upsertTemplate({ id: tmpl.id, template: tmpl, deprecated: false });
    const { req, ctx } = put(tmpl.id, { ...tmpl, name: "Renamed" });
    const res = await PUT(req, ctx);
    expect(res.status).toBe(200);
    expect((await getRepo().listTemplateRows())[0]!.template?.name).toBe("Renamed");
  });

  it("409s a built-in template", async () => {
    const id = builtInTemplates[0]!.id;
    const { req, ctx } = put(id, { ...tmpl, id });
    expect((await PUT(req, ctx)).status).toBe(409);
  });

  it("409s a template that is in use", async () => {
    await getRepo().upsertTemplate({ id: tmpl.id, template: tmpl, deprecated: false });
    await getRepo().createProposal("owner_a", { ...sampleProposal, templateId: tmpl.id });
    const { req, ctx } = put(tmpl.id, { ...tmpl, name: "Renamed" });
    expect((await PUT(req, ctx)).status).toBe(409);
  });

  it("404s an unknown authored id", async () => {
    const { req, ctx } = put("tmpl_ghost", { ...tmpl, id: "tmpl_ghost" });
    expect((await PUT(req, ctx)).status).toBe(404);
  });
});
