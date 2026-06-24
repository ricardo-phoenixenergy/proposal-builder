// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Template } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { invalidateActiveTemplates } from "../server/registry/activeTemplates";
import { POST } from "../../app/api/templates/[id]/deprecate/route";

const tmpl: Template = {
  id: "tmpl_sales",
  name: "Sales",
  themeId: "theme_phoenix_default",
  locked: false,
  slots: [{ kind: "fixed", type: "text", lock: "open" }],
};
const post = (id: string, body: unknown) => ({
  req: new Request(`http://x/api/templates/${id}/deprecate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }),
  ctx: { params: Promise.resolve({ id }) },
});

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveTemplates();
  setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: true }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
  invalidateActiveTemplates();
});

describe("POST /api/templates/[id]/deprecate", () => {
  it("deprecates an authored template", async () => {
    await getRepo().upsertTemplate({ id: tmpl.id, template: tmpl, deprecated: false });
    const { req, ctx } = post(tmpl.id, { deprecated: true });
    expect((await POST(req, ctx)).status).toBe(200);
    expect((await getRepo().listTemplateRows())[0]!.deprecated).toBe(true);
  });

  it("404s an unknown id when not deprecating", async () => {
    const { req, ctx } = post("tmpl_ghost", { deprecated: false });
    expect((await POST(req, ctx)).status).toBe(404);
  });

  it("403s a non-admin", async () => {
    setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: false }));
    const { req, ctx } = post("tmpl_sales", { deprecated: true });
    expect((await POST(req, ctx)).status).toBe(403);
  });
});
