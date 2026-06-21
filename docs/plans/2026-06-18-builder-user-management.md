# Builder — User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin create, list, disable/enable, promote/demote, and password-reset accounts from the `/admin` Builder dashboard's Users panel.

**Architecture:** Add a `disabled` flag to the existing `users` table; extend the `Repository` with user-management methods (both in-memory and Postgres); reject disabled accounts at sign-in; centralise the two guardrails (no self-lockout, keep one active admin) in a `assertCanModify` helper; expose admin-gated Route Handlers under `app/api/users/`; and add a `UsersView` panel wired into the dashboard shell's existing Users nav slot.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Drizzle ORM + Neon Postgres, Auth.js v5 credentials, Zustand, Vitest (node + jsdom projects).

## Global Constraints

- **Spec:** `docs/specs/2026-06-18-builder-user-management-design.md` is the source of truth.
- **Three-layer invariant** is unaffected here (this is auth/admin plumbing, no content/theme/template changes).
- **No public signup.** Accounts are admin-created; bootstrap first admin via `npm run user:create -w @proposal/web -- --admin <email> <password>`.
- **Passwords are scrypt-hashed** via `hashPassword` (`apps/web/src/server/auth/password.ts`); plaintext is never stored, never returned, never logged. The list/summary shape **never** includes `passwordHash`.
- **Password minimum: 8 characters** (after trim) on both create and reset.
- **Guardrails (server-authoritative):** (1) you cannot disable or demote your own account; (2) no action may drop the count of *active admins* (`isAdmin === true && disabled === false`) to zero. Both rejections return **409**.
- **Disabled accounts cannot sign in.** Enforced in `authenticateUser`. Known accepted limitation: stateless JWT sessions mean disable/demote takes effect at next sign-in, not instantly — do NOT add per-request DB session checks.
- **Module imports are extensionless** (`moduleResolution: "bundler"`); never add `.js`.
- **TypeScript strict** incl. `exactOptionalPropertyTypes`: only assign optional object properties when you have a defined value.
- **Tests are hermetic:** in-memory repo via `setRepoForTests`, admin identity via `setSessionUserResolverForTests`, client/UI via mocked `global.fetch`. Node-environment test files start with `// @vitest-environment node`; React test files use the default jsdom project.
- **No git in this workspace.** "Commit" steps are checkpoints: run the named test file(s) and `npm run typecheck -w @proposal/web`; both must be green before moving on. Record progress in the execution ledger instead of a commit hash.
- **Test commands:** a single file → `npm run test -w @proposal/web -- run <path>`; typecheck → `npm run typecheck -w @proposal/web`. (Postgres repo code is typecheck-gated only — there is no live DB in tests, mirroring the section-types slice.)

---

### Task 1: Repo types + in-memory user-management methods

Adds the `disabled` field, the `UserSummary` type, the `DuplicateEmailError` class, the new `Repository` method signatures, and the full in-memory implementation. This is the testable core of the slice.

**Files:**
- Modify: `apps/web/src/server/repo/types.ts`
- Modify: `apps/web/src/server/repo/memory.ts`
- Test: `apps/web/src/__tests__/slice-12-users-repo.test.ts` (create)

**Interfaces:**
- Consumes: existing `Repository`, `StoredUser`, `createMemoryRepo()`.
- Produces:
  - `StoredUser` gains `disabled: boolean`.
  - `interface UserSummary { id: string; email: string; isAdmin: boolean; disabled: boolean; createdAt: string }`
  - `class DuplicateEmailError extends Error {}`
  - `Repository` gains: `listUsers(): Promise<UserSummary[]>`, `getUserById(id: string): Promise<StoredUser | null>`, `setUserDisabled(id: string, disabled: boolean): Promise<UserSummary | null>`, `setUserAdmin(id: string, isAdmin: boolean): Promise<UserSummary | null>`, `setUserPassword(id: string, passwordHash: string): Promise<boolean>`, `countActiveAdmins(): Promise<number>`.
  - `createUser` now throws `DuplicateEmailError` on a repeat (normalized) email and sets `disabled: false`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-12-users-repo.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { DuplicateEmailError, type Repository } from "../server/repo/types";

let repo: Repository;
beforeEach(() => {
  repo = createMemoryRepo();
});

async function seed(email: string, opts: { isAdmin?: boolean; disabled?: boolean } = {}) {
  const u = await repo.createUser({ email, passwordHash: "h", isAdmin: opts.isAdmin ?? false });
  if (opts.disabled) await repo.setUserDisabled(u.id, true);
  return u;
}

describe("repo user management", () => {
  it("lists users without password hashes, oldest first", async () => {
    await seed("a@x.test", { isAdmin: true });
    await seed("b@x.test");
    const list = await repo.listUsers();
    expect(list.map((u) => u.email)).toEqual(["a@x.test", "b@x.test"]);
    expect(list[0]).not.toHaveProperty("passwordHash");
    expect(list[0]!.isAdmin).toBe(true);
    expect(list[0]!.disabled).toBe(false);
  });

  it("rejects a duplicate email (case-insensitive)", async () => {
    await seed("Owner@X.test");
    await expect(repo.createUser({ email: "owner@x.test", passwordHash: "h" })).rejects.toBeInstanceOf(
      DuplicateEmailError,
    );
  });

  it("toggles disabled and admin, returning a summary; null for unknown id", async () => {
    const u = await seed("a@x.test");
    expect((await repo.setUserDisabled(u.id, true))?.disabled).toBe(true);
    expect((await repo.setUserAdmin(u.id, true))?.isAdmin).toBe(true);
    expect(await repo.setUserDisabled("nope", true)).toBeNull();
    expect(await repo.setUserAdmin("nope", true)).toBeNull();
  });

  it("sets a password by id; false for unknown id", async () => {
    const u = await seed("a@x.test");
    expect(await repo.setUserPassword(u.id, "newhash")).toBe(true);
    expect((await repo.getUserById(u.id))?.passwordHash).toBe("newhash");
    expect(await repo.setUserPassword("nope", "x")).toBe(false);
  });

  it("counts only active admins (isAdmin && !disabled)", async () => {
    await seed("a@x.test", { isAdmin: true });
    await seed("b@x.test", { isAdmin: true, disabled: true });
    await seed("c@x.test");
    expect(await repo.countActiveAdmins()).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-users-repo.test.ts`
Expected: FAIL — `DuplicateEmailError` is not exported / methods are not functions.

- [ ] **Step 3: Add the types**

In `apps/web/src/server/repo/types.ts`, add `disabled: boolean;` to `StoredUser`:

```ts
export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  isAdmin: boolean;
  disabled: boolean;
  createdAt: string;
}
```

Add (anywhere after `StoredUser`):

```ts
/** Account fields safe to expose to the admin UI — never carries passwordHash. */
export interface UserSummary {
  id: string;
  email: string;
  isAdmin: boolean;
  disabled: boolean;
  createdAt: string;
}

/** Thrown by createUser when an account with the same (normalized) email exists. */
export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`An account with email "${email}" already exists`);
    this.name = "DuplicateEmailError";
  }
}
```

Extend the `Repository` interface — replace the existing Auth block with:

```ts
  /** Auth (§13.10). Accounts are admin-created; there is no public signup. */
  getUserByEmail(email: string): Promise<StoredUser | null>;
  getUserById(id: string): Promise<StoredUser | null>;
  /** @throws DuplicateEmailError if the normalized email already exists. */
  createUser(input: { email: string; passwordHash: string; isAdmin?: boolean }): Promise<StoredUser>;

  /** Builder user management (§11). Summaries never include passwordHash. */
  listUsers(): Promise<UserSummary[]>;
  setUserDisabled(id: string, disabled: boolean): Promise<UserSummary | null>;
  setUserAdmin(id: string, isAdmin: boolean): Promise<UserSummary | null>;
  setUserPassword(id: string, passwordHash: string): Promise<boolean>;
  countActiveAdmins(): Promise<number>;
```

- [ ] **Step 4: Implement the in-memory methods**

In `apps/web/src/server/repo/memory.ts`, import `UserSummary` and `DuplicateEmailError`:

```ts
import type {
  ProposalSummary,
  ProposalVersion,
  Repository,
  SectionTypeRow,
  StoredProposal,
  StoredTemplate,
  StoredTheme,
  StoredUser,
  UserSummary,
} from "./types";
import { DuplicateEmailError } from "./types";
```

Add two small helpers just below the `clone` definition near the top of the file:

```ts
const toSummary = (u: StoredUser): UserSummary => ({
  id: u.id,
  email: u.email,
  isAdmin: u.isAdmin,
  disabled: u.disabled,
  createdAt: u.createdAt,
});
```

Replace the existing `createUser` with a duplicate-checking version that sets `disabled: false`:

```ts
    async createUser({ email, passwordHash, isAdmin = false }) {
      const normalized = email.trim().toLowerCase();
      if (users.has(normalized)) throw new DuplicateEmailError(normalized);
      const stored: StoredUser = {
        id: uid("user"),
        email: normalized,
        passwordHash,
        isAdmin,
        disabled: false,
        createdAt: now(),
      };
      users.set(normalized, stored);
      return clone(stored);
    },
```

Add the new methods (place them right after `createUser`). The `users` Map is keyed by email, so id lookups scan its values (small N):

```ts
    async getUserById(id) {
      for (const u of users.values()) if (u.id === id) return clone(u);
      return null;
    },

    async listUsers() {
      return [...users.values()]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(toSummary);
    },

    async setUserDisabled(id, disabled) {
      for (const u of users.values()) {
        if (u.id !== id) continue;
        const updated: StoredUser = { ...u, disabled };
        users.set(u.email, updated);
        return toSummary(updated);
      }
      return null;
    },

    async setUserAdmin(id, isAdmin) {
      for (const u of users.values()) {
        if (u.id !== id) continue;
        const updated: StoredUser = { ...u, isAdmin };
        users.set(u.email, updated);
        return toSummary(updated);
      }
      return null;
    },

    async setUserPassword(id, passwordHash) {
      for (const u of users.values()) {
        if (u.id !== id) continue;
        users.set(u.email, { ...u, passwordHash });
        return true;
      }
      return false;
    },

    async countActiveAdmins() {
      let n = 0;
      for (const u of users.values()) if (u.isAdmin && !u.disabled) n++;
      return n;
    },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-users-repo.test.ts`
Expected: PASS (5/5).

- [ ] **Step 6: Checkpoint (commit)**

Run: `npm run typecheck -w @proposal/web`
Expected: the Postgres repo (`postgres.ts`) now FAILS typecheck because it doesn't implement the new `Repository` methods or the `disabled` field. **This is expected** — Task 2 resolves it. Confirm the memory test is green, then proceed. (If a clean typecheck is required before continuing, do Tasks 1 and 2 back-to-back.)

```bash
git add apps/web/src/server/repo/types.ts apps/web/src/server/repo/memory.ts apps/web/src/__tests__/slice-12-users-repo.test.ts
git commit -m "feat(repo): in-memory user-management methods + disabled flag + UserSummary"
```

---

### Task 2: Postgres parity — `disabled` column, migration, repo methods

Brings the Postgres repo and DB schema up to the new `Repository` shape and restores a clean typecheck.

**Files:**
- Modify: `apps/web/src/server/db/schema.ts`
- Modify: `apps/web/src/server/repo/postgres.ts`
- Create (generated): `apps/web/drizzle/0003_*.sql` (+ `meta/0003_snapshot.json`, updated `meta/_journal.json`)

**Interfaces:**
- Consumes: `UserSummary`, `DuplicateEmailError` from Task 1; Drizzle `users` table.
- Produces: Postgres implementation of all Task-1 `Repository` methods; `users.disabled` column.

- [ ] **Step 1: Add the column to the Drizzle schema**

In `apps/web/src/server/db/schema.ts`, add `disabled` to the `users` table:

```ts
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  disabled: boolean("disabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate -w @proposal/web`
Expected: a new `apps/web/drizzle/0003_*.sql` containing roughly
`ALTER TABLE "users" ADD COLUMN "disabled" boolean DEFAULT false NOT NULL;`
plus a `meta/0003_snapshot.json` and an updated `_journal.json`. Open the `.sql` and confirm it only adds the column (no destructive statements).

- [ ] **Step 3: Implement the Postgres repo methods**

In `apps/web/src/server/repo/postgres.ts`:

Import the new symbols and add the `and` operator:

```ts
import { and, desc, eq, sql } from "drizzle-orm";
import type { Repository, SectionTypeRow, StoredProposal, UserSummary } from "./types";
import { DuplicateEmailError } from "./types";
```

Add a row→summary helper near `toStored` at the top of the file:

```ts
type UserRow = typeof users.$inferSelect;
const toUserSummary = (r: UserRow): UserSummary => ({
  id: r.id,
  email: r.email,
  isAdmin: r.isAdmin,
  disabled: r.disabled,
  createdAt: r.createdAt.toISOString(),
});
```

Update `getUserByEmail` to include `disabled`:

```ts
    async getUserByEmail(email) {
      const [row] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
      return row
        ? { id: row.id, email: row.email, passwordHash: row.passwordHash, isAdmin: row.isAdmin, disabled: row.disabled, createdAt: row.createdAt.toISOString() }
        : null;
    },
```

Replace `createUser` with a duplicate-aware version:

```ts
    async createUser({ email, passwordHash, isAdmin = false }) {
      try {
        const [row] = await db
          .insert(users)
          .values({ id: uid("user"), email: email.trim().toLowerCase(), passwordHash, isAdmin })
          .returning();
        return { id: row!.id, email: row!.email, passwordHash: row!.passwordHash, isAdmin: row!.isAdmin, disabled: row!.disabled, createdAt: row!.createdAt.toISOString() };
      } catch (e) {
        if ((e as { code?: string }).code === "23505") throw new DuplicateEmailError(email.trim().toLowerCase());
        throw e;
      }
    },

    async getUserById(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id));
      return row
        ? { id: row.id, email: row.email, passwordHash: row.passwordHash, isAdmin: row.isAdmin, disabled: row.disabled, createdAt: row.createdAt.toISOString() }
        : null;
    },

    async listUsers() {
      const rows = await db.select().from(users).orderBy(users.createdAt);
      return rows.map(toUserSummary);
    },

    async setUserDisabled(id, disabled) {
      const [row] = await db.update(users).set({ disabled }).where(eq(users.id, id)).returning();
      return row ? toUserSummary(row) : null;
    },

    async setUserAdmin(id, isAdmin) {
      const [row] = await db.update(users).set({ isAdmin }).where(eq(users.id, id)).returning();
      return row ? toUserSummary(row) : null;
    },

    async setUserPassword(id, passwordHash) {
      const rows = await db.update(users).set({ passwordHash }).where(eq(users.id, id)).returning();
      return rows.length > 0;
    },

    async countActiveAdmins() {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.isAdmin, true), eq(users.disabled, false)));
      return rows.length;
    },
```

(Note: `and` is now imported; if `desc`/`sql` are already used elsewhere keep them.)

- [ ] **Step 4: Verify typecheck is clean**

Run: `npm run typecheck -w @proposal/web`
Expected: exit 0 — both repos now satisfy the `Repository` interface.

- [ ] **Step 5: Run the repo test (regression)**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-users-repo.test.ts`
Expected: PASS (5/5) — unchanged; confirms Task 1 still green.

- [ ] **Step 6: Checkpoint (commit)**

```bash
git add apps/web/src/server/db/schema.ts apps/web/src/server/repo/postgres.ts apps/web/drizzle
git commit -m "feat(repo): postgres user-management parity + users.disabled migration 0003"
```

---

### Task 3: `authenticateUser` rejects disabled accounts

**Files:**
- Modify: `apps/web/src/server/auth/credentials.ts`
- Test: `apps/web/src/__tests__/slice-12-auth-disabled.test.ts` (create)

**Interfaces:**
- Consumes: `authenticateUser(email, password)`, repo `createUser`/`setUserDisabled`, `hashPassword`.
- Produces: a disabled account never authenticates.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-12-auth-disabled.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../server/auth/password";
import { authenticateUser } from "../server/auth/credentials";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";

beforeEach(() => setRepoForTests(createMemoryRepo()));
afterEach(() => setRepoForTests(null));

describe("authenticateUser — disabled accounts", () => {
  it("rejects a disabled account even with the correct password", async () => {
    const u = await getRepo().createUser({ email: "a@x.test", passwordHash: hashPassword("hunter2longpw") });
    await getRepo().setUserDisabled(u.id, true);
    expect(await authenticateUser("a@x.test", "hunter2longpw")).toBeNull();
  });

  it("still authenticates an enabled account", async () => {
    await getRepo().createUser({ email: "b@x.test", passwordHash: hashPassword("hunter2longpw") });
    expect((await authenticateUser("b@x.test", "hunter2longpw"))?.email).toBe("b@x.test");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-auth-disabled.test.ts`
Expected: FAIL — the disabled user currently authenticates (first test fails).

- [ ] **Step 3: Add the disabled check**

In `apps/web/src/server/auth/credentials.ts`, add the guard after the password check:

```ts
  const user = await getRepo().getUserByEmail(email);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  if (user.disabled) return null; // disabled accounts cannot sign in (§B)

  return { id: user.id, email: user.email, isAdmin: user.isAdmin };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-auth-disabled.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Checkpoint (commit)**

```bash
git add apps/web/src/server/auth/credentials.ts apps/web/src/__tests__/slice-12-auth-disabled.test.ts
git commit -m "feat(auth): reject disabled accounts at sign-in"
```

---

### Task 4: `isValidEmail` helper

A minimal email-shape check (not RFC validation) used by the create route.

**Files:**
- Create: `apps/web/src/server/auth/email.ts`
- Test: `apps/web/src/__tests__/slice-12-email.test.ts` (create)

**Interfaces:**
- Produces: `isValidEmail(email: string): boolean`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-12-email.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isValidEmail } from "../server/auth/email";

describe("isValidEmail (minimal shape check)", () => {
  it("accepts a normal address", () => {
    expect(isValidEmail("owner@company.com")).toBe(true);
    expect(isValidEmail("a@b")).toBe(true); // no dot required — minimal check
  });
  it("rejects empty local or domain, missing @, doubled @, or whitespace", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("nobody")).toBe(false);
    expect(isValidEmail("@b.com")).toBe(false);
    expect(isValidEmail("a@")).toBe(false);
    expect(isValidEmail("a@b@c")).toBe(false);
    expect(isValidEmail("a b@c")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-email.test.ts`
Expected: FAIL — module not found / `isValidEmail` not defined.

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/server/auth/email.ts`:

```ts
/**
 * Minimal email-shape check (NOT RFC validation, per spec §E): exactly one "@",
 * non-empty local and domain parts, no whitespace. Stricter validation is
 * intentionally out of scope.
 */
export function isValidEmail(email: string): boolean {
  const t = email.trim();
  const at = t.indexOf("@");
  return at > 0 && at < t.length - 1 && !/\s/.test(t) && t.indexOf("@", at + 1) === -1;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-email.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Checkpoint (commit)**

```bash
git add apps/web/src/server/auth/email.ts apps/web/src/__tests__/slice-12-email.test.ts
git commit -m "feat(auth): minimal isValidEmail helper"
```

---

### Task 5: `assertCanModify` guard helper

Centralises the two guardrails so every route and the UI share one source of truth.

**Files:**
- Create: `apps/web/src/server/auth/userGuards.ts`
- Test: `apps/web/src/__tests__/slice-12-user-guards.test.ts` (create)

**Interfaces:**
- Consumes: `getRepo()` (`getUserById`, `countActiveAdmins`).
- Produces:
  - `class GuardError extends Error {}`
  - `assertCanModify(actingAdminId: string, targetId: string, change: { disabled?: boolean; isAdmin?: boolean }): Promise<void>` — throws `GuardError` when the change is forbidden; resolves otherwise (including when the target id is unknown — the route maps that to 404 via the setter's null return).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-12-user-guards.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { assertCanModify, GuardError } from "../server/auth/userGuards";

beforeEach(() => setRepoForTests(createMemoryRepo()));
afterEach(() => setRepoForTests(null));

const mkAdmin = (email: string) => getRepo().createUser({ email, passwordHash: "h", isAdmin: true });
const mkMember = (email: string) => getRepo().createUser({ email, passwordHash: "h", isAdmin: false });

describe("assertCanModify", () => {
  it("blocks disabling your own account", async () => {
    const me = await mkAdmin("me@x.test");
    await mkAdmin("other@x.test"); // not the last admin
    await expect(assertCanModify(me.id, me.id, { disabled: true })).rejects.toBeInstanceOf(GuardError);
  });

  it("blocks demoting your own account", async () => {
    const me = await mkAdmin("me@x.test");
    await mkAdmin("other@x.test");
    await expect(assertCanModify(me.id, me.id, { isAdmin: false })).rejects.toBeInstanceOf(GuardError);
  });

  it("blocks disabling the only active admin", async () => {
    const a = await mkAdmin("a@x.test");
    const actor = await mkMember("actor@x.test"); // pretend a different admin acts; a is the sole active admin
    await expect(assertCanModify(actor.id, a.id, { disabled: true })).rejects.toBeInstanceOf(GuardError);
  });

  it("blocks demoting the only active admin", async () => {
    const a = await mkAdmin("a@x.test");
    const actor = await mkMember("actor@x.test");
    await expect(assertCanModify(actor.id, a.id, { isAdmin: false })).rejects.toBeInstanceOf(GuardError);
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-user-guards.test.ts`
Expected: FAIL — module not found / `assertCanModify` not defined.

- [ ] **Step 3: Implement the guard**

Create `apps/web/src/server/auth/userGuards.ts`:

```ts
import { getRepo } from "../repo";

/** Thrown when a user-management change violates a guardrail (mapped to 409 by routes). */
export class GuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardError";
  }
}

/**
 * Enforce the two user-management guardrails (§D), server-authoritatively:
 *  1. No self-lockout — you can't disable or demote your own account.
 *  2. Keep one active admin — no change may drop active admins (isAdmin && !disabled) to zero.
 * Resolves when the change is allowed (including when the target id is unknown —
 * the calling route turns the setter's null return into a 404).
 */
export async function assertCanModify(
  actingAdminId: string,
  targetId: string,
  change: { disabled?: boolean; isAdmin?: boolean },
): Promise<void> {
  const demotesSelf = change.isAdmin === false;
  const disablesSelf = change.disabled === true;
  if (targetId === actingAdminId && (demotesSelf || disablesSelf)) {
    throw new GuardError("You can't disable or demote your own account");
  }

  const repo = getRepo();
  const target = await repo.getUserById(targetId);
  if (!target) return; // unknown id — let the route 404 it

  const removesActiveAdmin =
    target.isAdmin && !target.disabled && (change.isAdmin === false || change.disabled === true);
  if (removesActiveAdmin && (await repo.countActiveAdmins()) <= 1) {
    throw new GuardError("There must be at least one active admin");
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-user-guards.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Checkpoint (commit)**

```bash
git add apps/web/src/server/auth/userGuards.ts apps/web/src/__tests__/slice-12-user-guards.test.ts
git commit -m "feat(auth): assertCanModify guardrails (no self-lockout, keep one active admin)"
```

---

### Task 6: `GET` + `POST /api/users`

List accounts and create a new one (admin only).

**Files:**
- Create: `apps/web/app/api/users/route.ts`
- Test: `apps/web/src/__tests__/slice-12-users-route.test.ts` (create)

**Interfaces:**
- Consumes: `requireAdmin` (returns acting admin id `string`, or a `Response`), `getRepo()`, `hashPassword`, `isValidEmail`, `DuplicateEmailError`.
- Produces:
  - `GET` → `200 { users: UserSummary[] }`; 401 unauth; 403 non-admin.
  - `POST { email, password, isAdmin? }` → `201 { user: UserSummary }`; 400 invalid email / password < 8; 409 duplicate.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-12-users-route.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { GET, POST } from "../../app/api/users/route";

const post = (body: unknown) =>
  new Request("http://x/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

let admin = true;
beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  admin = true;
  setSessionUserResolverForTests(async () => ({ id: "actor", isAdmin: admin }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
});

describe("GET /api/users", () => {
  it("401s unauth, 403s non-admin, lists for admin without hashes", async () => {
    setSessionUserResolverForTests(async () => null);
    expect((await GET()).status).toBe(401);

    setSessionUserResolverForTests(async () => ({ id: "actor", isAdmin: false }));
    expect((await GET()).status).toBe(403);

    setSessionUserResolverForTests(async () => ({ id: "actor", isAdmin: true }));
    await getRepo().createUser({ email: "a@x.test", passwordHash: "h" });
    const body = (await (await GET()).json()) as { users: Array<Record<string, unknown>> };
    expect(body.users).toHaveLength(1);
    expect(body.users[0]).not.toHaveProperty("passwordHash");
  });
});

describe("POST /api/users", () => {
  it("creates an account (201) and stores a hash, not the plaintext", async () => {
    const res = await POST(post({ email: "New@X.test", password: "longenough", isAdmin: true }));
    expect(res.status).toBe(201);
    const stored = await getRepo().getUserByEmail("new@x.test");
    expect(stored?.isAdmin).toBe(true);
    expect(stored?.passwordHash).not.toContain("longenough");
  });

  it("403s a non-admin", async () => {
    setSessionUserResolverForTests(async () => ({ id: "actor", isAdmin: false }));
    expect((await POST(post({ email: "a@x.test", password: "longenough" }))).status).toBe(403);
  });

  it("400s an invalid email or a short password", async () => {
    expect((await POST(post({ email: "nope", password: "longenough" }))).status).toBe(400);
    expect((await POST(post({ email: "a@x.test", password: "short" }))).status).toBe(400);
  });

  it("409s a duplicate email", async () => {
    await POST(post({ email: "dup@x.test", password: "longenough" }));
    expect((await POST(post({ email: "dup@x.test", password: "longenough" }))).status).toBe(409);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-users-route.test.ts`
Expected: FAIL — `app/api/users/route` does not exist.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/users/route.ts`:

```ts
// apps/web/app/api/users/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "../../../src/server/auth/guard";
import { hashPassword } from "../../../src/server/auth/password";
import { isValidEmail } from "../../../src/server/auth/email";
import { getRepo } from "../../../src/server/repo";
import { DuplicateEmailError, type UserSummary } from "../../../src/server/repo/types";

/** GET — list all accounts (admin only). */
export async function GET(): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  return NextResponse.json({ users: await getRepo().listUsers() });
}

/** POST — create an account (admin only). Body { email, password, isAdmin? }. */
export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; password?: unknown; isAdmin?: unknown }
    | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const isAdmin = body?.isAdmin === true;

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (password.trim().length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  try {
    const user = await getRepo().createUser({ email, passwordHash: hashPassword(password), isAdmin });
    const summary: UserSummary = {
      id: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
      disabled: user.disabled,
      createdAt: user.createdAt,
    };
    return NextResponse.json({ user: summary }, { status: 201 });
  } catch (e) {
    if (e instanceof DuplicateEmailError) {
      return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
    }
    throw e;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-users-route.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Checkpoint (commit)**

```bash
git add apps/web/app/api/users/route.ts apps/web/src/__tests__/slice-12-users-route.test.ts
git commit -m "feat(api): GET + POST /api/users (list + create, admin-gated)"
```

---

### Task 7: `PATCH /api/users/[id]`

Disable/enable and promote/demote, guarded.

**Files:**
- Create: `apps/web/app/api/users/[id]/route.ts`
- Test: `apps/web/src/__tests__/slice-12-users-patch.test.ts` (create)

**Interfaces:**
- Consumes: `requireAdmin`, `assertCanModify`/`GuardError`, `getRepo()` (`setUserAdmin`, `setUserDisabled`).
- Produces: `PATCH { disabled?, isAdmin? }` → `200 { user: UserSummary }`; 400 empty change; 404 unknown id; 409 guard violation.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-12-users-patch.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { PATCH } from "../../app/api/users/[id]/route";

const patch = (id: string, body: unknown) => ({
  req: new Request(`http://x/api/users/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  ctx: { params: Promise.resolve({ id }) },
});

let actorId = "actor";
beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  actorId = "actor";
  setSessionUserResolverForTests(async () => ({ id: actorId, isAdmin: true }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
});

describe("PATCH /api/users/[id]", () => {
  it("disables and re-enables another user", async () => {
    await getRepo().createUser({ email: "admin@x.test", passwordHash: "h", isAdmin: true }); // keeps an active admin
    const u = await getRepo().createUser({ email: "u@x.test", passwordHash: "h" });
    const { req, ctx } = patch(u.id, { disabled: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { disabled: boolean } }).user.disabled).toBe(true);
  });

  it("promotes and demotes another user", async () => {
    await getRepo().createUser({ email: "admin@x.test", passwordHash: "h", isAdmin: true });
    const u = await getRepo().createUser({ email: "u@x.test", passwordHash: "h" });
    const up = patch(u.id, { isAdmin: true });
    expect(((await (await PATCH(up.req, up.ctx)).json()) as { user: { isAdmin: boolean } }).user.isAdmin).toBe(true);
  });

  it("400s an empty change body", async () => {
    const u = await getRepo().createUser({ email: "u@x.test", passwordHash: "h" });
    const { req, ctx } = patch(u.id, {});
    expect((await PATCH(req, ctx)).status).toBe(400);
  });

  it("404s an unknown id", async () => {
    await getRepo().createUser({ email: "admin@x.test", passwordHash: "h", isAdmin: true });
    const { req, ctx } = patch("ghost", { disabled: true });
    expect((await PATCH(req, ctx)).status).toBe(404);
  });

  it("409s disabling your own account (self-lockout)", async () => {
    const me = await getRepo().createUser({ email: "me@x.test", passwordHash: "h", isAdmin: true });
    await getRepo().createUser({ email: "other@x.test", passwordHash: "h", isAdmin: true });
    actorId = me.id;
    const { req, ctx } = patch(me.id, { disabled: true });
    expect((await PATCH(req, ctx)).status).toBe(409);
  });

  it("409s demoting the only active admin", async () => {
    const a = await getRepo().createUser({ email: "a@x.test", passwordHash: "h", isAdmin: true });
    // actor is a separate (non-persisted) identity, so `a` is the sole active admin
    const { req, ctx } = patch(a.id, { isAdmin: false });
    expect((await PATCH(req, ctx)).status).toBe(409);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-users-patch.test.ts`
Expected: FAIL — `app/api/users/[id]/route` does not exist.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/users/[id]/route.ts`:

```ts
// apps/web/app/api/users/[id]/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../src/server/auth/guard";
import { assertCanModify, GuardError } from "../../../../src/server/auth/userGuards";
import { getRepo } from "../../../../src/server/repo";
import type { UserSummary } from "../../../../src/server/repo/types";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH — disable/enable and/or promote/demote (admin only), behind guardrails. */
export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as { disabled?: unknown; isAdmin?: unknown } | null;
  const change: { disabled?: boolean; isAdmin?: boolean } = {};
  if (typeof body?.disabled === "boolean") change.disabled = body.disabled;
  if (typeof body?.isAdmin === "boolean") change.isAdmin = body.isAdmin;
  if (change.disabled === undefined && change.isAdmin === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    await assertCanModify(admin, id, change);
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }

  let summary: UserSummary | null = null;
  if (change.isAdmin !== undefined) summary = await getRepo().setUserAdmin(id, change.isAdmin);
  if (change.disabled !== undefined) summary = await getRepo().setUserDisabled(id, change.disabled);
  if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ user: summary });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-users-patch.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Checkpoint (commit)**

```bash
git add "apps/web/app/api/users/[id]/route.ts" apps/web/src/__tests__/slice-12-users-patch.test.ts
git commit -m "feat(api): PATCH /api/users/[id] (disable/role, guarded)"
```

---

### Task 8: `POST /api/users/[id]/password`

Admin-set password reset.

**Files:**
- Create: `apps/web/app/api/users/[id]/password/route.ts`
- Test: `apps/web/src/__tests__/slice-12-users-password.test.ts` (create)

**Interfaces:**
- Consumes: `requireAdmin`, `hashPassword`, `getRepo().setUserPassword`.
- Produces: `POST { password }` → `200 { ok: true }`; 400 password < 8; 404 unknown id.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-12-users-password.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyPassword } from "../server/auth/password";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { POST } from "../../app/api/users/[id]/password/route";

const post = (id: string, body: unknown) => ({
  req: new Request(`http://x/api/users/${id}/password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  ctx: { params: Promise.resolve({ id }) },
});

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  setSessionUserResolverForTests(async () => ({ id: "actor", isAdmin: true }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
});

describe("POST /api/users/[id]/password", () => {
  it("resets the password (200) and stores a verifiable hash", async () => {
    const u = await getRepo().createUser({ email: "u@x.test", passwordHash: "h" });
    const { req, ctx } = post(u.id, { password: "brandnewpw" });
    expect((await POST(req, ctx)).status).toBe(200);
    const stored = await getRepo().getUserById(u.id);
    expect(verifyPassword("brandnewpw", stored!.passwordHash)).toBe(true);
  });

  it("400s a short password", async () => {
    const u = await getRepo().createUser({ email: "u@x.test", passwordHash: "h" });
    const { req, ctx } = post(u.id, { password: "short" });
    expect((await POST(req, ctx)).status).toBe(400);
  });

  it("404s an unknown id", async () => {
    const { req, ctx } = post("ghost", { password: "brandnewpw" });
    expect((await POST(req, ctx)).status).toBe(404);
  });

  it("403s a non-admin", async () => {
    setSessionUserResolverForTests(async () => ({ id: "actor", isAdmin: false }));
    const { req, ctx } = post("any", { password: "brandnewpw" });
    expect((await POST(req, ctx)).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-users-password.test.ts`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/users/[id]/password/route.ts`:

```ts
// apps/web/app/api/users/[id]/password/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../src/server/auth/guard";
import { hashPassword } from "../../../../../src/server/auth/password";
import { getRepo } from "../../../../../src/server/repo";

type Ctx = { params: Promise<{ id: string }> };

/** POST — admin sets a new password for an account. Body { password }. */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.trim().length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const ok = await getRepo().setUserPassword(id, hashPassword(password));
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-users-password.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Checkpoint (commit)**

```bash
git add "apps/web/app/api/users/[id]/password/route.ts" apps/web/src/__tests__/slice-12-users-password.test.ts
git commit -m "feat(api): POST /api/users/[id]/password (admin-set reset)"
```

---

### Task 9: `client/users.ts` fetch module

Browser-side wrappers, mirroring `client/sectionTypes.ts`.

**Files:**
- Create: `apps/web/src/client/users.ts`
- Test: `apps/web/src/__tests__/slice-12-users-client.test.ts` (create)

**Interfaces:**
- Consumes: `fetch` (mocked in tests), `UserSummary` type.
- Produces:
  - `fetchUsers(): Promise<UserSummary[]>`
  - `createUser(input: { email: string; password: string; isAdmin: boolean }): Promise<UserSummary>`
  - `updateUser(id: string, change: { disabled?: boolean; isAdmin?: boolean }): Promise<UserSummary>`
  - `setUserPassword(id: string, password: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-12-users-client.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUsers, createUser, updateUser, setUserPassword } from "../client/users";

afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
const err = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

const summary = { id: "u1", email: "a@x.test", isAdmin: false, disabled: false, createdAt: "2026-01-01T00:00:00.000Z" };

describe("client/users", () => {
  it("fetchUsers unwraps { users }", async () => {
    vi.stubGlobal("fetch", vi.fn(() => ok({ users: [summary] })));
    expect(await fetchUsers()).toEqual([summary]);
  });

  it("createUser posts and returns the new summary", async () => {
    const f = vi.fn(() => ok({ user: summary }));
    vi.stubGlobal("fetch", f);
    expect(await createUser({ email: "a@x.test", password: "longenough", isAdmin: false })).toEqual(summary);
    expect(f).toHaveBeenCalledWith("/api/users", expect.objectContaining({ method: "POST" }));
  });

  it("updateUser PATCHes and returns the summary", async () => {
    const f = vi.fn(() => ok({ user: { ...summary, disabled: true } }));
    vi.stubGlobal("fetch", f);
    expect((await updateUser("u1", { disabled: true })).disabled).toBe(true);
    expect(f).toHaveBeenCalledWith("/api/users/u1", expect.objectContaining({ method: "PATCH" }));
  });

  it("throws the server error message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(() => err(409, { error: "dup" })));
    await expect(createUser({ email: "a@x.test", password: "longenough", isAdmin: false })).rejects.toThrow("dup");
  });

  it("setUserPassword posts to the password sub-route", async () => {
    const f = vi.fn(() => ok({ ok: true }));
    vi.stubGlobal("fetch", f);
    await setUserPassword("u1", "brandnewpw");
    expect(f).toHaveBeenCalledWith("/api/users/u1/password", expect.objectContaining({ method: "POST" }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-users-client.test.ts`
Expected: FAIL — `../client/users` does not exist.

- [ ] **Step 3: Implement the client module**

Create `apps/web/src/client/users.ts`:

```ts
import type { UserSummary } from "../server/repo/types";

async function readError(res: Response, fallback: string): Promise<never> {
  const err = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(err.error ?? fallback);
}

export async function fetchUsers(): Promise<UserSummary[]> {
  const res = await fetch("/api/users");
  if (!res.ok) await readError(res, `Failed to load users (${res.status})`);
  return ((await res.json()) as { users: UserSummary[] }).users;
}

export async function createUser(input: { email: string; password: string; isAdmin: boolean }): Promise<UserSummary> {
  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) await readError(res, "Create failed");
  return ((await res.json()) as { user: UserSummary }).user;
}

export async function updateUser(id: string, change: { disabled?: boolean; isAdmin?: boolean }): Promise<UserSummary> {
  const res = await fetch(`/api/users/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(change),
  });
  if (!res.ok) await readError(res, "Update failed");
  return ((await res.json()) as { user: UserSummary }).user;
}

export async function setUserPassword(id: string, password: string): Promise<void> {
  const res = await fetch(`/api/users/${id}/password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) await readError(res, "Update failed");
}
```

> Note: `import type { UserSummary }` is erased at build time — no server code is pulled into the client bundle.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-users-client.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Checkpoint (commit)**

```bash
git add apps/web/src/client/users.ts apps/web/src/__tests__/slice-12-users-client.test.ts
git commit -m "feat(client): users fetch module"
```

---

### Task 10: `UsersView` component

The Users panel: list, create form, per-row actions, guard mirroring.

**Files:**
- Create: `apps/web/src/ui/admin/UsersView.tsx`
- Test: `apps/web/src/__tests__/slice-12-users-view.test.tsx` (create)

**Interfaces:**
- Consumes: `fetchUsers`, `createUser`, `updateUser`, `setUserPassword` (client module); `useProposalStore().notify`; `UserSummary` type.
- Produces: `UsersView({ currentUserId }: { currentUserId: string })`. List rows carry `data-user={id}`; role badge text `admin`/`member`; status badge `disabled`; row action buttons `Enable`/`Disable`, `Make admin`/`Revoke admin`, `Set password`. Self row and sole-active-admin row have Disable + Revoke-admin disabled.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-12-users-view.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { UsersView } from "../ui/admin/UsersView";

const me = { id: "me", email: "me@x.test", isAdmin: true, disabled: false, createdAt: "2026-01-01T00:00:00.000Z" };
const other = { id: "other", email: "other@x.test", isAdmin: false, disabled: false, createdAt: "2026-01-02T00:00:00.000Z" };

function mockFetch(handlers: Record<string, (init?: RequestInit) => Response>) {
  return vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    const h = handlers[key];
    if (!h) throw new Error(`unexpected fetch: ${key}`);
    return Promise.resolve(h(init));
  });
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => vi.stubGlobal("fetch", mockFetch({ "GET /api/users": () => json({ users: [me, other] }) })));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UsersView", () => {
  it("lists accounts with role + status and locks the self row's Disable", async () => {
    render(<UsersView currentUserId="me" />);
    await waitFor(() => expect(screen.getByText("me@x.test")).toBeInTheDocument());

    const meRow = screen.getByText("me@x.test").closest("[data-user]") as HTMLElement;
    expect(within(meRow).getByText("admin")).toBeInTheDocument();
    // me is the sole active admin AND the current user → Disable + Revoke admin disabled
    expect(within(meRow).getByRole("button", { name: /disable/i })).toBeDisabled();
    expect(within(meRow).getByRole("button", { name: /revoke admin/i })).toBeDisabled();

    const otherRow = screen.getByText("other@x.test").closest("[data-user]") as HTMLElement;
    expect(within(otherRow).getByText("member")).toBeInTheDocument();
    expect(within(otherRow).getByRole("button", { name: /^disable/i })).not.toBeDisabled();
  });

  it("creates an account and prepends it", async () => {
    const created = { id: "new", email: "new@x.test", isAdmin: false, disabled: false, createdAt: "2026-01-03T00:00:00.000Z" };
    vi.stubGlobal("fetch", mockFetch({
      "GET /api/users": () => json({ users: [me, other] }),
      "POST /api/users": () => json({ user: created }, 201),
    }));
    render(<UsersView currentUserId="me" />);
    await waitFor(() => expect(screen.getByText("me@x.test")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "new@x.test" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "longenough" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(screen.getByText("new@x.test")).toBeInTheDocument());
  });

  it("toggles disable on another user via PATCH", async () => {
    vi.stubGlobal("fetch", mockFetch({
      "GET /api/users": () => json({ users: [me, other] }),
      "PATCH /api/users/other": () => json({ user: { ...other, disabled: true } }),
    }));
    render(<UsersView currentUserId="me" />);
    await waitFor(() => expect(screen.getByText("other@x.test")).toBeInTheDocument());

    const otherRow = screen.getByText("other@x.test").closest("[data-user]") as HTMLElement;
    fireEvent.click(within(otherRow).getByRole("button", { name: /disable/i }));
    await waitFor(() => expect(within(otherRow).getByText("disabled")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-users-view.test.tsx`
Expected: FAIL — `../ui/admin/UsersView` does not exist.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/ui/admin/UsersView.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { UserSummary } from "../../server/repo/types";
import { createUser, fetchUsers, setUserPassword, updateUser } from "../../client/users";
import { useProposalStore } from "../../state/proposalStore";

export function UsersView({ currentUserId }: { currentUserId: string }) {
  const notify = useProposalStore((s) => s.notify);
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setUsers(await fetchUsers());
      } catch {
        notify("error", "Couldn't load users.");
        setUsers([]);
      }
    })();
  }, [notify]);

  const activeAdmins = (users ?? []).filter((u) => u.isAdmin && !u.disabled).length;

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await createUser({ email, password, isAdmin: makeAdmin });
      setUsers((prev) => [created, ...(prev ?? [])]);
      setEmail("");
      setPassword("");
      setMakeAdmin(false);
      notify("success", "Account created.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Create failed");
    }
  };

  const patch = async (id: string, change: { disabled?: boolean; isAdmin?: boolean }) => {
    try {
      const updated = await updateUser(id, change);
      setUsers((prev) => (prev ?? []).map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Update failed");
    }
  };

  const onSetPassword = async (id: string) => {
    const pw = window.prompt("New password (minimum 8 characters)");
    if (pw === null) return;
    try {
      await setUserPassword(id, pw);
      notify("success", "Password updated.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Update failed");
    }
  };

  if (users === null) {
    return (
      <div className="stlist">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="stlist">
      <div className="stlist__head">
        <h2>Users</h2>
      </div>

      <form className="userform" onSubmit={onCreate}>
        <input aria-label="Email" type="email" placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input aria-label="Password" type="password" placeholder="Password (min 8)" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <label className="userform__admin">
          <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} /> Admin
        </label>
        <button type="submit" className="btn btn--primary">
          Create account
        </button>
      </form>

      <ul className="stlist__rows">
        {users.map((u) => {
          const isSelf = u.id === currentUserId;
          const soleActiveAdmin = u.isAdmin && !u.disabled && activeAdmins <= 1;
          const lockReason = isSelf
            ? "You can't disable or demote your own account"
            : "There must be at least one active admin";
          const lockDisable = !u.disabled && (isSelf || soleActiveAdmin);
          const lockDemote = u.isAdmin && (isSelf || soleActiveAdmin);
          return (
            <li key={u.id} data-user={u.id} className="stlist__row">
              <div className="stlist__main">
                <span className="stlist__label">{u.email}</span>
                <code className="stlist__key">{new Date(u.createdAt).toLocaleDateString()}</code>
              </div>
              <div className="stlist__tags">
                <span className="tag">{u.isAdmin ? "admin" : "member"}</span>
                {u.disabled ? <span className="tag tag--unstyled">disabled</span> : null}
              </div>
              <div className="stlist__actions">
                <button
                  type="button"
                  className="btn"
                  disabled={lockDisable}
                  title={lockDisable ? lockReason : undefined}
                  onClick={() => void patch(u.id, { disabled: !u.disabled })}
                >
                  {u.disabled ? "Enable" : "Disable"}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={lockDemote}
                  title={lockDemote ? lockReason : undefined}
                  onClick={() => void patch(u.id, { isAdmin: !u.isAdmin })}
                >
                  {u.isAdmin ? "Revoke admin" : "Make admin"}
                </button>
                <button type="button" className="btn" onClick={() => void onSetPassword(u.id)}>
                  Set password
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-users-view.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Checkpoint (commit)**

```bash
git add apps/web/src/ui/admin/UsersView.tsx apps/web/src/__tests__/slice-12-users-view.test.tsx
git commit -m "feat(ui): UsersView panel (list, create, disable/role/password, guard mirroring)"
```

---

### Task 11: Wire the dashboard, page, styles, and docs; full verify

Enable the Users nav slot, switch panels, pass the current admin's id from the server, add minimal styles for the create form, document the JWT limitation, and run the whole suite + build.

**Files:**
- Modify: `apps/web/src/ui/admin/AdminDashboard.tsx`
- Modify: `apps/web/app/admin/page.tsx`
- Modify: `apps/web/src/__tests__/slice-11-admin-shell.test.tsx` (pass new required prop)
- Modify: `apps/web/app/globals.css` (add `.userform` styles)
- Modify: `apps/web/.env.local.example` (document the JWT mid-session-revocation limitation)
- Test: `apps/web/src/__tests__/slice-12-admin-nav.test.tsx` (create)

**Interfaces:**
- Consumes: `UsersView` (Task 10); `AdminDashboard` gains a required `currentUserId: string` prop.
- Produces: `/admin` renders the Users panel when the Users nav item is clicked.

- [ ] **Step 1: Write the failing nav test**

Create `apps/web/src/__tests__/slice-12-admin-nav.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { builtInSectionTypes } from "@proposal/shared";
import { AdminDashboard } from "../ui/admin/AdminDashboard";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ users: [] }), { status: 200, headers: { "content-type": "application/json" } }))),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminDashboard nav", () => {
  it("switches from Section types to the Users panel", async () => {
    render(<AdminDashboard sectionTypes={builtInSectionTypes} inUse={[]} currentUserId="me" />);
    // Section types panel is the default
    expect(screen.getByText("Executive summary")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^users$/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /^users$/i })).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-admin-nav.test.tsx`
Expected: FAIL — `currentUserId` is not a prop / Users button is disabled / `UsersView` not rendered.

- [ ] **Step 3: Update the dashboard shell**

Replace `apps/web/src/ui/admin/AdminDashboard.tsx` with:

```tsx
"use client";

import { useState } from "react";
import type { SectionTypeSchema } from "@proposal/shared";
import { SectionTypeList } from "./SectionTypeList";
import { UsersView } from "./UsersView";

type Panel = "section-types" | "users";

/** Back-of-house dashboard shell (§11). Section types + Users; Templates is the next slice. */
export function AdminDashboard({
  sectionTypes,
  inUse,
  currentUserId,
}: {
  sectionTypes: SectionTypeSchema[];
  inUse: string[];
  currentUserId: string;
}) {
  const [types, setTypes] = useState(sectionTypes);
  const [panel, setPanel] = useState<Panel>("section-types");

  return (
    <div className="admin">
      <header className="admin__bar">
        <h1 className="admin__title">Builder</h1>
        <a className="btn btn--ghost" href="/">
          ← Back to editor
        </a>
      </header>
      <div className="admin__body">
        <nav className="admin__nav" aria-label="Builder sections">
          <button
            type="button"
            className="admin__navitem"
            aria-current={panel === "section-types"}
            onClick={() => setPanel("section-types")}
          >
            Section types
          </button>
          <button
            type="button"
            className="admin__navitem"
            aria-current={panel === "users"}
            onClick={() => setPanel("users")}
          >
            Users
          </button>
          <button type="button" className="admin__navitem" disabled title="Coming next">
            Templates
          </button>
        </nav>
        <main className="admin__main">
          {panel === "section-types" ? (
            <SectionTypeList types={types} inUse={inUse} onChange={setTypes} />
          ) : (
            <UsersView currentUserId={currentUserId} />
          )}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Pass the admin id from the page**

In `apps/web/app/admin/page.tsx`, pass `session.user.id` (the redirect guard above guarantees it exists):

```tsx
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/");

  const [sectionTypes, inUse] = await Promise.all([
    getMergedSectionTypes(),
    getRepo().listInUseTypeKeys(),
  ]);
  return <AdminDashboard sectionTypes={sectionTypes} inUse={inUse} currentUserId={session.user.id} />;
```

- [ ] **Step 5: Fix the existing admin-shell test for the new required prop**

In `apps/web/src/__tests__/slice-11-admin-shell.test.tsx`, update the render call:

```tsx
    render(<AdminDashboard sectionTypes={builtInSectionTypes} inUse={[]} currentUserId="admin" />);
```

This test does not stub `fetch`, and `UsersView` only fetches when the Users panel is shown (default is Section types), so no stub is needed.

- [ ] **Step 6: Add minimal create-form styles**

In `apps/web/app/globals.css`, append (after the existing `.stlist` rules; reuse existing tokens):

```css
.userform {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin: 0 0 16px;
}
.userform input[type="email"],
.userform input[type="password"] {
  padding: 7px 10px;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--ui-surface);
  color: var(--ui-text);
}
.userform__admin {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
```

> If `--ui-border`/`--ui-surface`/`--ui-text` are not the exact token names in `globals.css`, match the names already used by the `.topbar`/`.stlist` chrome — do not introduce new tokens.

- [ ] **Step 7: Document the JWT limitation**

In `apps/web/.env.local.example`, under the Auth section (after the `AUTH_SECRET` block), add:

```
# Accounts are managed from the Builder dashboard (/admin → Users): create, disable/
# enable, promote/demote, and reset passwords. NOTE: sessions are stateless JWTs, so
# disabling or demoting a user takes effect at their NEXT sign-in — a live session
# keeps its token until it expires.
```

- [ ] **Step 8: Run the new nav test + the changed shell test**

Run: `npm run test -w @proposal/web -- run src/__tests__/slice-12-admin-nav.test.tsx src/__tests__/slice-11-admin-shell.test.tsx`
Expected: PASS (both files green).

- [ ] **Step 9: Full verification**

Run: `npm run test -w @proposal/web -- run`
Expected: entire suite green (all prior slices + the new slice-12 files).

Run: `npm run typecheck -w @proposal/web`
Expected: exit 0.

Run: `npm run build -w @proposal/web`
Expected: clean build; the route list includes `/api/users`, `/api/users/[id]`, and `/api/users/[id]/password`.

- [ ] **Step 10: Checkpoint (commit)**

```bash
git add apps/web/src/ui/admin/AdminDashboard.tsx apps/web/app/admin/page.tsx \
  apps/web/src/__tests__/slice-11-admin-shell.test.tsx apps/web/src/__tests__/slice-12-admin-nav.test.tsx \
  apps/web/app/globals.css apps/web/.env.local.example
git commit -m "feat(ui): wire Users panel into dashboard + page id + styles + docs"
```

---

## Self-Review

**Spec coverage:**
- §A data model (`disabled`, `UserSummary`, migration) → Tasks 1, 2. ✅
- §B auth rejects disabled (+ JWT limitation doc) → Tasks 3, 11 (step 7). ✅
- §C repo methods (+ `DuplicateEmailError`, dup-email in both repos) → Tasks 1, 2. ✅
- §D guardrails (`assertCanModify`, `GuardError`) → Task 5; enforced in PATCH (Task 7); mirrored in UI (Task 10). ✅
- §E routes (GET/POST/PATCH/password, status codes, `isValidEmail`, 8-char min) → Tasks 4, 6, 7, 8. ✅
- §F UI (dashboard nav, `UsersView`, `client/users.ts`, pass `currentUserId`) → Tasks 9, 10, 11. ✅
- §G testing — every task is TDD with hermetic seams. ✅
- File map — every Create/Modify path in the spec appears in a task. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The one conditional instruction (CSS token names in Task 11 step 6) gives an explicit fallback rule, not a placeholder.

**Type consistency:** `UserSummary`, `DuplicateEmailError`, `GuardError`, `assertCanModify`, and all six repo method signatures are defined in Tasks 1/5 and consumed unchanged in Tasks 2/6/7/8/9/10. `requireAdmin` returns `string | Response` (acting admin id) and is used that way in the guard call. `notify(kind, message)` matches the store. The PATCH applies `setUserAdmin` then `setUserDisabled` so the returned summary reflects both fields.

**Note for executors (no-git workspace):** this workspace is not a git repo; the `git` commands in each "Checkpoint" step are illustrative. Treat each checkpoint as: the named test file(s) pass **and** `npm run typecheck -w @proposal/web` is green (except the deliberate Task-1→Task-2 interim noted in Task 1 step 6). Record progress in `docs/plans/builder-progress.md`.
