// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { GET, POST } from "../../app/api/folders/route";
import { PATCH, DELETE } from "../../app/api/folders/[id]/route";

const post = (body: unknown) =>
  new Request("http://x/api/folders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const idReq = (id: string, method: string, body?: unknown) => ({
  req: new Request(`http://x/api/folders/${id}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }),
  ctx: { params: Promise.resolve({ id }) },
});

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  setOwnerResolverForTests(async () => "owner_a");
});
afterEach(() => {
  setRepoForTests(null);
  setOwnerResolverForTests(null);
});

describe("/api/folders", () => {
  it("creates, lists, 400s empty name", async () => {
    expect((await POST(post({ name: "Sales" }))).status).toBe(201);
    expect((await POST(post({ name: "  " }))).status).toBe(400);
    const body = (await (await GET()).json()) as { folders: { name: string }[] };
    expect(body.folders.map((f) => f.name)).toEqual(["Sales"]);
  });

  it("renames (200) and deletes (204); 404 unknown", async () => {
    const f = await getRepo().createFolder("owner_a", "Sales");
    const r = idReq(f.id, "PATCH", { name: "Renamed" });
    expect((await PATCH(r.req, r.ctx)).status).toBe(200);
    const d = idReq(f.id, "DELETE");
    expect((await DELETE(d.req, d.ctx)).status).toBe(204);
    const gone = idReq(f.id, "DELETE");
    expect((await DELETE(gone.req, gone.ctx)).status).toBe(404);
  });
});
