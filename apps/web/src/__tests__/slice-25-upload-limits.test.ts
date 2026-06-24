// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { POST as importCsv } from "../../app/api/data/import/route";

beforeEach(() => setOwnerResolverForTests(async () => "owner_local"));
afterEach(() => setOwnerResolverForTests(null));

function bigCsvForm(bytes: number): Request {
  const fd = new FormData();
  fd.set("file", new File([new Uint8Array(bytes)], "big.csv", { type: "text/csv" }));
  return new Request("http://localhost/api/data/import", { method: "POST", body: fd });
}

describe("upload/import size limits", () => {
  it("413s a CSV over the cap before parsing", async () => {
    const res = await importCsv(bigCsvForm(5 * 1024 * 1024 + 1));
    expect(res.status).toBe(413);
  });
});
