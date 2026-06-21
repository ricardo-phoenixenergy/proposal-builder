// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Vercel Blob so the upload is tested without network or a token.
const put = vi.fn(async (pathname: string) => ({ url: `https://blob.test/${pathname}` }));
vi.mock("@vercel/blob", () => ({ put: (...args: unknown[]) => put(...(args as [string])) }));

import { setOwnerResolverForTests } from "../server/auth/owner";
import { POST as uploadAsset } from "../../app/api/assets/route";

let owner: string | null = "owner_a";
beforeEach(() => {
  owner = "owner_a";
  setOwnerResolverForTests(async () => owner);
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
});
afterEach(() => {
  setOwnerResolverForTests(null);
  vi.clearAllMocks();
});

function form(file?: File): Request {
  const fd = new FormData();
  if (file) fd.append("file", file);
  return new Request("http://x/api/assets", { method: "POST", body: fd });
}

describe("POST /api/assets — logo/image upload to Blob (§10.2, §13.10)", () => {
  it("401s when unauthenticated", async () => {
    owner = null;
    expect((await uploadAsset(form(new File(["x"], "logo.png", { type: "image/png" })))).status).toBe(401);
    expect(put).not.toHaveBeenCalled();
  });

  it("400s when no file is provided", async () => {
    expect((await uploadAsset(form())).status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it("415s for a non-image file", async () => {
    expect((await uploadAsset(form(new File(["x"], "data.csv", { type: "text/csv" })))).status).toBe(415);
    expect(put).not.toHaveBeenCalled();
  });

  it("uploads an image and returns its public URL, namespaced by owner", async () => {
    const res = await uploadAsset(form(new File(["x"], "logo.png", { type: "image/png" })));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toContain("https://blob.test/");
    expect(put).toHaveBeenCalledWith(expect.stringContaining("owner_a"), expect.anything(), expect.objectContaining({ access: "public" }));
  });
});
