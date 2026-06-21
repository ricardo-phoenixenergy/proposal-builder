// @vitest-environment node
// Pure server-side logic (Route Handler + parser). Node's File/FormData are
// reliable here; jsdom's Blob.text() hangs.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Dataset } from "@proposal/shared";
import { csvToDataset } from "../server/csvToDataset";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { POST } from "../../app/api/data/import/route";

beforeEach(() => setOwnerResolverForTests(async () => "owner_local"));
afterEach(() => setOwnerResolverForTests(null));

describe("csvToDataset — CSV → normalized Dataset", () => {
  it("parses headers + typed columns, honouring quoted fields", () => {
    const ds = csvToDataset('Item,Price\n"Panel, mono",120\nInverter,300');
    expect(ds.columns.map((c) => c.key)).toEqual(["item", "price"]);
    expect(ds.columns[1]!.type).toBe("number");
    expect(ds.rows[0]).toEqual({ item: "Panel, mono", price: 120 });
    expect(ds.rows).toHaveLength(2);
  });
});

describe("POST /api/data/import", () => {
  it("returns a normalized dataset for an uploaded CSV file", async () => {
    const form = new FormData();
    form.append("file", new File(["A,B\n1,2\n3,4"], "data.csv", { type: "text/csv" }));
    const res = await POST(new Request("http://localhost/api/data/import", { method: "POST", body: form }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataset: Dataset };
    expect(body.dataset.columns).toHaveLength(2);
    expect(body.dataset.rows).toHaveLength(2);
  });

  it("400s when no file is provided", async () => {
    const res = await POST(new Request("http://localhost/api/data/import", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(400);
  });
});
