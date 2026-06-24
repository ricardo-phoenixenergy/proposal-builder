// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { GET as listProposals, POST as createProposal } from "../../app/api/proposals/route";
import {
  GET as getProposal,
  PUT as saveProposal,
  DELETE as deleteProposal,
} from "../../app/api/proposals/[id]/route";
import { GET as listVersions, POST as snapshot } from "../../app/api/proposals/[id]/versions/route";

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  setOwnerResolverForTests(async () => "owner_local");
});
afterEach(() => {
  setRepoForTests(null);
  setOwnerResolverForTests(null);
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

async function createOne() {
  const res = await createProposal(json("http://x/api/proposals", "POST", sampleProposal));
  expect(res.status).toBe(201);
  return ((await res.json()) as { proposal: { id: string } }).proposal;
}

describe("proposals API — autosave round-trip (§13.8)", () => {
  it("create → list → get → autosave (PUT) → reload restores → delete", async () => {
    const created = await createOne();

    const list = (await (await listProposals()).json()) as { proposals: { id: string }[] };
    expect(list.proposals.map((p) => p.id)).toContain(created.id);

    await saveProposal(
      json(`http://x/api/proposals/${created.id}`, "PUT", {
        ...sampleProposal,
        title: "Autosaved",
      }),
      ctx(created.id),
    );

    const reloaded = (await (
      await getProposal(json(`http://x/api/proposals/${created.id}`, "GET"), ctx(created.id))
    ).json()) as {
      proposal: { document: { title: string } };
    };
    expect(reloaded.proposal.document.title).toBe("Autosaved");

    const del = await deleteProposal(
      json(`http://x/api/proposals/${created.id}`, "DELETE"),
      ctx(created.id),
    );
    expect(del.status).toBe(204);
  });

  it("404s on autosave/get for an unknown id", async () => {
    expect(
      (await getProposal(json("http://x/api/proposals/nope", "GET"), ctx("nope"))).status,
    ).toBe(404);
    expect(
      (await saveProposal(json("http://x/api/proposals/nope", "PUT", sampleProposal), ctx("nope")))
        .status,
    ).toBe(404);
  });

  it("400s on a malformed create body", async () => {
    expect(
      (await createProposal(json("http://x/api/proposals", "POST", { nope: true }))).status,
    ).toBe(400);
  });
});

describe("versions API — export snapshots", () => {
  it("captures and lists a version", async () => {
    const created = await createOne();
    const snap = await snapshot(
      json(`http://x/api/proposals/${created.id}/versions`, "POST"),
      ctx(created.id),
    );
    expect(snap.status).toBe(201);
    const list = (await (await listVersions(json("http://x", "GET"), ctx(created.id))).json()) as {
      versions: unknown[];
    };
    expect(list.versions).toHaveLength(1);
  });
});
