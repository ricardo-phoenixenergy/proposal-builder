// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { invalidateActiveLayouts } from "../server/registry/activeLayouts";
import {
  setActiveSectionTypes,
  resetSectionTypesForTests,
  type SectionLayout,
  type SectionTypeSchema,
} from "@proposal/shared";
import { GET, POST } from "../../app/api/section-layouts/route";
import { PUT, DELETE } from "../../app/api/section-layouts/[type]/[variant]/[format]/route";

const coverType: SectionTypeSchema = {
  type: "cover",
  label: "Cover",
  category: "text",
  fields: [{ key: "title", type: "text", label: "Title" }],
  variants: [],
  schemaVersion: 1,
};
const layout: SectionLayout = {
  type: "cover",
  variant: "cover",
  pageFormat: "a4_portrait",
  name: "Cover",
  root: { kind: "stack", children: [{ kind: "heading", field: "title" }] },
  version: 1,
};

const post = (body: unknown) =>
  new Request("http://x/api/section-layouts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const put = (body: unknown) =>
  new Request("http://x/api/section-layouts/cover/cover/a4_portrait", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = (type: string, variant: string, format: string) => ({
  params: Promise.resolve({ type, variant, format }),
});

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  resetSectionTypesForTests();
  setActiveSectionTypes([coverType]);
  invalidateActiveLayouts();
  setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: true }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
  resetSectionTypesForTests();
  invalidateActiveLayouts();
});

describe("section-layouts routes", () => {
  it("POST 401/403 by auth", async () => {
    setSessionUserResolverForTests(async () => null);
    expect((await POST(post(layout))).status).toBe(401);
    setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: false }));
    expect((await POST(post(layout))).status).toBe(403);
  });

  it("POST 400 on unknown type / unknown format / invalid layout", async () => {
    expect((await POST(post({ ...layout, type: "ghost" }))).status).toBe(400);
    expect((await POST(post({ ...layout, pageFormat: "nope" }))).status).toBe(400);
    expect(
      (await POST(post({ ...layout, root: { kind: "heading", field: "missing" } }))).status,
    ).toBe(400);
  });

  it("POST 201 then 409 on duplicate; GET lists it", async () => {
    expect((await POST(post(layout))).status).toBe(201);
    expect((await POST(post(layout))).status).toBe(409);
    const body = (await (await GET()).json()) as { layouts: SectionLayout[] };
    expect(body.layouts.some((l) => l.variant === "cover")).toBe(true);
  });

  it("PUT 404 unknown then 200; DELETE 204 then 404", async () => {
    expect((await PUT(put(layout), ctx("cover", "cover", "a4_portrait"))).status).toBe(404);
    await POST(post(layout));
    expect(
      (await PUT(put({ ...layout, name: "Cover v2" }), ctx("cover", "cover", "a4_portrait")))
        .status,
    ).toBe(200);
    expect((await getRepo().listSectionLayouts()).find((l) => l.variant === "cover")!.name).toBe(
      "Cover v2",
    );
    expect((await DELETE(put(layout), ctx("cover", "cover", "a4_portrait"))).status).toBe(204);
    expect((await DELETE(put(layout), ctx("cover", "cover", "a4_portrait"))).status).toBe(404);
  });

  it("GET 401 when unauthenticated", async () => {
    setSessionUserResolverForTests(async () => null);
    expect((await GET()).status).toBe(401);
  });
});
