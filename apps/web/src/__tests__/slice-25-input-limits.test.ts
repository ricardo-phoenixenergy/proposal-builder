// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { POST as genSection } from "../../app/api/generate/section/route";

const req = (body: unknown) =>
  new Request("http://localhost/api/generate/section", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => setOwnerResolverForTests(async () => "owner_local"));
afterEach(() => setOwnerResolverForTests(null));

describe("generation input limits", () => {
  it("400s an over-long brief before calling the model", async () => {
    const res = await genSection(req({ type: "cover", brief: "x".repeat(6001) }));
    expect(res.status).toBe(400);
  });
});
