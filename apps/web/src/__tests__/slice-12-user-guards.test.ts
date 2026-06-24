// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { assertCanModify, GuardError } from "../server/auth/userGuards";

beforeEach(() => setRepoForTests(createMemoryRepo()));
afterEach(() => setRepoForTests(null));

const mkAdmin = (email: string) =>
  getRepo().createUser({ email, passwordHash: "h", isAdmin: true });
const mkMember = (email: string) =>
  getRepo().createUser({ email, passwordHash: "h", isAdmin: false });

describe("assertCanModify", () => {
  it("blocks disabling your own account", async () => {
    const me = await mkAdmin("me@x.test");
    await mkAdmin("other@x.test"); // not the last admin
    await expect(assertCanModify(me.id, me.id, { disabled: true })).rejects.toBeInstanceOf(
      GuardError,
    );
  });

  it("blocks demoting your own account", async () => {
    const me = await mkAdmin("me@x.test");
    await mkAdmin("other@x.test");
    await expect(assertCanModify(me.id, me.id, { isAdmin: false })).rejects.toBeInstanceOf(
      GuardError,
    );
  });

  it("blocks disabling the only active admin", async () => {
    const a = await mkAdmin("a@x.test");
    const actor = await mkMember("actor@x.test"); // distinct actor; guard doesn't re-check the actor's role — `a` is the sole active admin
    await expect(assertCanModify(actor.id, a.id, { disabled: true })).rejects.toBeInstanceOf(
      GuardError,
    );
  });

  it("blocks demoting the only active admin", async () => {
    const a = await mkAdmin("a@x.test");
    const actor = await mkMember("actor@x.test");
    await expect(assertCanModify(actor.id, a.id, { isAdmin: false })).rejects.toBeInstanceOf(
      GuardError,
    );
  });

  it("allows disabling an admin when another active admin remains", async () => {
    const a = await mkAdmin("a@x.test");
    await mkAdmin("b@x.test");
    const actor = await mkMember("actor@x.test");
    await expect(assertCanModify(actor.id, a.id, { disabled: true })).resolves.toBeUndefined();
  });

  it("allows enabling/promoting freely (never reduces active admins)", async () => {
    const a = await mkAdmin("a@x.test");
    const m = await mkMember("m@x.test");
    await expect(assertCanModify(a.id, m.id, { isAdmin: true })).resolves.toBeUndefined();
    await expect(assertCanModify(a.id, m.id, { disabled: false })).resolves.toBeUndefined();
  });

  it("does not throw for an unknown target id (route handles 404)", async () => {
    const a = await mkAdmin("a@x.test");
    await expect(assertCanModify(a.id, "nope", { disabled: true })).resolves.toBeUndefined();
  });
});
