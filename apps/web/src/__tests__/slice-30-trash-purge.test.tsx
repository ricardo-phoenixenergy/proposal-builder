// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests } from "../server/repo";
import type { Repository } from "../server/repo/types";
import { GET as purgeCron } from "../../app/api/cron/purge-trash/route";

describe("repository — purgeExpiredTrash (4b)", () => {
  let repo: Repository;
  beforeEach(() => {
    repo = createMemoryRepo();
  });

  it("hard-deletes only trash older than the cutoff (incl. its versions)", async () => {
    const a = await repo.createProposal("o1", sampleProposal);
    const b = await repo.createProposal("o1", sampleProposal);
    const live = await repo.createProposal("o1", sampleProposal);
    await repo.snapshotVersion(a.id);
    await repo.deleteProposal(a.id);
    await repo.deleteProposal(b.id);

    // cutoff in the future → every trashed proposal is expired.
    const purged = await repo.purgeExpiredTrash(new Date(Date.now() + 86_400_000));
    expect(purged).toBe(2);
    expect(await repo.getProposal(a.id)).toBeNull();
    expect(await repo.listVersions(a.id)).toHaveLength(0);
    // the live proposal is untouched.
    expect((await repo.listProposals("o1")).map((p) => p.id)).toEqual([live.id]);
  });

  it("keeps trash newer than the cutoff", async () => {
    const a = await repo.createProposal("o1", sampleProposal);
    await repo.deleteProposal(a.id);
    const purged = await repo.purgeExpiredTrash(new Date(0)); // cutoff in the past
    expect(purged).toBe(0);
    expect((await repo.listTrashedProposals("o1")).map((p) => p.id)).toEqual([a.id]);
  });
});

describe("cron route — POST/GET /api/cron/purge-trash (4b)", () => {
  beforeEach(() => {
    setRepoForTests(createMemoryRepo());
    process.env.CRON_SECRET = "s3cret";
  });
  afterEach(() => {
    setRepoForTests(null);
    delete process.env.CRON_SECRET;
    delete process.env.TRASH_TTL_DAYS;
  });

  const get = (auth?: string) =>
    new Request("http://x/api/cron/purge-trash", {
      headers: auth ? { authorization: auth } : {},
    });

  it("401s without the cron bearer secret", async () => {
    expect((await purgeCron(get())).status).toBe(401);
    expect((await purgeCron(get("Bearer wrong"))).status).toBe(401);
  });

  it("purges expired trash when authorized", async () => {
    process.env.TRASH_TTL_DAYS = "-1"; // cutoff = now + 1 day → all trash expired
    const repo = createMemoryRepo();
    setRepoForTests(repo);
    const p = await repo.createProposal("o1", sampleProposal);
    await repo.deleteProposal(p.id);

    const res = await purgeCron(get("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect((await res.json()) as { purged: number }).toEqual({ purged: 1 });
    expect(await repo.getProposal(p.id)).toBeNull();
  });
});
