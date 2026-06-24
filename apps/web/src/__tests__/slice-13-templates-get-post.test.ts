// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { builtInTemplates, type Template } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { invalidateActiveTemplates } from "../server/registry/activeTemplates";
import { invalidateActiveRegistry } from "../server/registry/activeRegistry";
import { GET, POST } from "../../app/api/templates/route";

const def: Template = {
  id: "tmpl_sales",
  name: "Sales",
  themeId: "theme_phoenix_default",
  locked: false,
  slots: [{ kind: "fixed", type: "text", lock: "open" }],
};
const post = (body: unknown) =>
  new Request("http://x/api/templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

let admin = true;
beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveTemplates();
  invalidateActiveRegistry();
  admin = true;
  setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: admin }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
  invalidateActiveTemplates();
  invalidateActiveRegistry();
});

describe("GET /api/templates", () => {
  it("lists built-ins for any authed user", async () => {
    const body = (await (await GET()).json()) as { templates: Template[] };
    expect(body.templates.map((t) => t.id)).toEqual(
      expect.arrayContaining(builtInTemplates.map((t) => t.id)),
    );
  });
});

describe("POST /api/templates", () => {
  it("403s a non-admin", async () => {
    setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: false }));
    expect((await POST(post(def))).status).toBe(403);
  });

  it("creates a valid template", async () => {
    expect((await POST(post(def))).status).toBe(201);
    expect((await getRepo().listTemplateRows()).map((r) => r.id)).toContain("tmpl_sales");
  });

  it("400s an invalid template", async () => {
    expect((await POST(post({ ...def, slots: [] }))).status).toBe(400);
  });

  it("409s a duplicate id (built-in or existing authored)", async () => {
    expect((await POST(post({ ...def, id: builtInTemplates[0]!.id }))).status).toBe(409);
    await POST(post(def));
    expect((await POST(post(def))).status).toBe(409);
  });
});
