# Audit Phase 2 — Security & Scale Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the production security/scale gaps from `AUDIT_REVIEW.md` now that the guardrails (CI, lint, hooks) are in place: non-blocking password hashing (H-7), session revocation on account-disable (H-5), atomic user updates (M-12), generation rate limiting (M-2), data-integrity fixes (M-6), and database indexes (H-6).

**Architecture:** Surgical, behaviour-preserving changes at the auth, repo, and route layers. The session-user seam (`getSessionUser`) is the single choke point for all API auth — the disabled-check lives there (server-side/node), NOT in the edge Auth.js callback. The repository interface gains one atomic method. Indexes are introduced via a Drizzle migration whose **production apply is a separate, explicitly-authorized step** (this phase only generates + commits the SQL).

**Tech Stack:** Next 15 (App Router) · Auth.js v5 (JWT sessions) · Drizzle 0.38 + Neon serverless (HTTP driver — **no interactive transactions**) · `node:crypto` · Vitest 2.

## Global Constraints

- Commands at REPO ROOT: single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`; lint `npm run lint`; format `npm run format`/`format:check`; build `npm run build -w @proposal/web`; migration generate `npm run db:generate -w @proposal/web`.
- This IS a git repo; work on a branch off `main`. Commit per task. A pre-commit hook (lint-staged) now runs `eslint --fix` + `prettier --write` on staged files — let it run; do not bypass it.
- TS strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); extensionless imports. After each task: `npm run typecheck` 0, `npm run lint` 0 errors, `npm run format:check` clean, full suite green (was 441/441 + new tests).
- Preserve the injectable test seams: `setRepoForTests`, `setSessionUserResolverForTests`/`setOwnerResolverForTests`.
- **Neon HTTP driver does NOT support `db.transaction()`** — do not introduce interactive transactions; use single atomic statements instead.
- **DB migration (Task 6) is NOT applied to production in this phase.** Generate + commit the SQL only. Applying `db:migrate` to prod Neon requires the user's explicit authorization and the documented `DATABASE_URL` load recipe; flag it for them.
- Both repo implementations (`memory.ts`, `postgres.ts`) must stay behaviourally equivalent for any interface change.

---

### Task 1: Async (non-blocking) password hashing (H-7)

**Files:**
- Modify: `apps/web/src/server/auth/password.ts`
- Modify: `apps/web/src/server/auth/credentials.ts` (await verifyPassword)
- Modify: all `hashPassword(`/`verifyPassword(` call sites (grep — at least the admin create-user route, the password-reset route, the `user:create` script, and any test helper)
- Test: `apps/web/src/__tests__/slice-26-password-async.test.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): Promise<string>` and `verifyPassword(password: string, stored: string): Promise<boolean>` — same format (`salt:hex`), same constant-time compare, but using `crypto.scrypt` async (no event-loop block).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-26-password-async.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../server/auth/password";

describe("password hashing (async)", () => {
  it("round-trips a password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
  });

  it("returns false for a malformed stored value", async () => {
    expect(await verifyPassword("x", "not-a-valid-hash")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-26-password-async.test.ts`
Expected: FAIL — `hashPassword`/`verifyPassword` are currently sync (returning a string/boolean, not a Promise), so `await`ing works but the test for `verifyPassword` returning a Promise that resolves to boolean compiles; the real failure is a typecheck/shape mismatch once you change them, OR the test passes against sync versions. To make the RED meaningful: this test should be written, then Step 3 changes the functions to async — re-run confirms still green. (This task's "red" is the typecheck: callers that don't await will fail `npm run typecheck` in Step 4.)

- [ ] **Step 3: Make hashing async**

Replace `apps/web/src/server/auth/password.ts`:
```ts
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const KEYLEN = 64;
const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

/**
 * Hash a password with scrypt (§13.10), async so it never blocks the event loop
 * (H-7). Format: `salt:derivedKey` (both hex). Node's built-in scrypt — no
 * bcrypt/argon dependency.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEYLEN)).toString("hex");
  return `${salt}:${derived}`;
}

/** Constant-time verification of a password against a stored `salt:hash`. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await scryptAsync(password, salt, expected.length || KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
```

- [ ] **Step 4: Update all call sites**

Run `npm run typecheck` and follow the errors (the return types are now Promises). Update each caller to `await`:
- `credentials.ts:24` → `if (!(await verifyPassword(password, user.passwordHash))) return null;`
- The admin create-user route and password-reset route (grep `hashPassword(`) → `await hashPassword(...)` (their handlers are already async).
- `apps/web/scripts/create-user.mjs` (the `user:create` script) → await the hash.
- Any test helper that calls `hashPassword`/`verifyPassword` synchronously → await it.
Use `git grep -n "hashPassword(\|verifyPassword("` to find them all.

- [ ] **Step 5: Verify**

Run: `npx vitest run apps/web/src/__tests__/slice-26-password-async.test.ts` + the existing auth tests (`git grep -l "verifyPassword\|authenticateUser\|password" apps/web/src/__tests__`), then `npm run typecheck` (0) + `npm run lint` (0 errors).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(auth): async scrypt password hashing — no event-loop block (H-7)"
```

---

### Task 2: Session revocation on account-disable (H-5)

**Files:**
- Modify: `apps/web/src/server/auth/sessionUser.ts` (disabled-check + TTL cache + invalidate)
- Test: `apps/web/src/__tests__/slice-26-session-revocation.test.ts`

**Interfaces:**
- Produces: the production resolver (`fromNextAuth`) now returns `null` for a user who is disabled or no longer exists, cached ~30s. Exports `invalidateUserActiveCache(id: string): void` (called by the disable path in Task 3) and `resetUserActiveCacheForTests(): void`.
- Rationale: this is the single server-side choke point for all API guards (`requireOwner`/`requireAdmin`/`requireOwnedProposal` all resolve through `getSessionUser`). The edge Auth.js callback in `auth.config.ts` cannot do a DB lookup (it must stay edge-safe), so revocation lives here.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-26-session-revocation.test.ts`:
```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { getSessionUser, setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { invalidateUserActiveCache, resetUserActiveCacheForTests } from "../server/auth/sessionUser";

// Stub the NextAuth session to a fixed user id; the disabled-check is what we test.
vi.mock("../../auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", isAdmin: false } })) }));

beforeEach(async () => {
  setRepoForTests(createMemoryRepo());
  setSessionUserResolverForTests(null); // use the REAL fromNextAuth resolver
  resetUserActiveCacheForTests();
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
  resetUserActiveCacheForTests();
});

describe("session revocation on disable", () => {
  it("resolves an active user, then returns null once disabled (cache invalidated)", async () => {
    const u = await getRepo().createUser({ email: "u1@x.com", passwordHash: "h", isAdmin: false });
    // The mocked auth() returns id "u1"; align the created id for the lookup.
    await getRepo().setUserDisabled(u.id, false);
    // Point the mock at the real id:
    const { auth } = await import("../../auth");
    (auth as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({ user: { id: u.id, isAdmin: false } });

    expect(await getSessionUser()).toMatchObject({ id: u.id });

    await getRepo().setUserDisabled(u.id, true);
    invalidateUserActiveCache(u.id);
    expect(await getSessionUser()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-26-session-revocation.test.ts`
Expected: FAIL — `invalidateUserActiveCache`/`resetUserActiveCacheForTests` don't exist, and `fromNextAuth` does not currently check `disabled`.

- [ ] **Step 3: Add the disabled-check + cache**

Rewrite `apps/web/src/server/auth/sessionUser.ts`:
```ts
export interface SessionUser {
  id: string;
  isAdmin: boolean;
}
export type SessionUserResolver = () => Promise<SessionUser | null>;

const ACTIVE_TTL_MS = 30_000;
const activeCache = new Map<string, { active: boolean; exp: number }>();

/** Drop a user's cached active-state so a disable takes effect immediately. */
export function invalidateUserActiveCache(id: string): void {
  activeCache.delete(id);
}
export function resetUserActiveCacheForTests(): void {
  activeCache.clear();
}

/** Is the account still active (exists and not disabled)? Cached ~30s. */
async function isActive(id: string): Promise<boolean> {
  const now = Date.now();
  const hit = activeCache.get(id);
  if (hit && hit.exp > now) return hit.active;
  const { getRepo } = await import("../repo");
  const user = await getRepo().getUserById(id);
  const active = !!user && !user.disabled;
  activeCache.set(id, { active, exp: now + ACTIVE_TTL_MS });
  return active;
}

async function fromNextAuth(): Promise<SessionUser | null> {
  const { auth } = await import("../../../auth");
  const session = await auth();
  if (!session?.user?.id) return null;
  if (!(await isActive(session.user.id))) return null; // revoked: disabled or deleted (H-5)
  return { id: session.user.id, isAdmin: session.user.isAdmin === true };
}

let resolver: SessionUserResolver = fromNextAuth;

export function setSessionUserResolverForTests(next: SessionUserResolver | null): void {
  resolver = next ?? fromNextAuth;
}

export function getSessionUser(): Promise<SessionUser | null> {
  return resolver();
}
```
(`Date.now()` is fine in app code; it's only forbidden in workflow scripts.)

- [ ] **Step 4: Verify**

Run: `npx vitest run apps/web/src/__tests__/slice-26-session-revocation.test.ts` → PASS. Then the existing auth/guard tests (they inject their own resolver via `setSessionUserResolverForTests`/`setOwnerResolverForTests`, so they bypass `fromNextAuth` and stay green). `npm run typecheck` 0, `npm run lint` 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(auth): revoke active sessions when an account is disabled (H-5)"
```

---

### Task 3: Atomic user PATCH (M-12) + invalidate on disable

**Files:**
- Modify: `apps/web/src/server/repo/types.ts` (add `patchUser`)
- Modify: `apps/web/src/server/repo/memory.ts`, `apps/web/src/server/repo/postgres.ts` (implement `patchUser`)
- Modify: `apps/web/app/api/users/[id]/route.ts` (use `patchUser`; invalidate the H-5 cache on disable)
- Test: `apps/web/src/__tests__/slice-26-patch-user.test.ts`

**Interfaces:**
- Consumes: `invalidateUserActiveCache` (Task 2).
- Produces: `Repository.patchUser(id, change: { isAdmin?: boolean; disabled?: boolean }): Promise<UserSummary | null>` — applies both fields in ONE update (no two-call partial-state window). The route calls it once and invalidates the active-cache when `disabled` changed.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-26-patch-user.test.ts`:
```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";

beforeEach(() => setRepoForTests(createMemoryRepo()));
afterEach(() => setRepoForTests(null));

describe("repo.patchUser", () => {
  it("applies isAdmin and disabled in a single call", async () => {
    const u = await getRepo().createUser({ email: "a@x.com", passwordHash: "h", isAdmin: false });
    const updated = await getRepo().patchUser(u.id, { isAdmin: true, disabled: true });
    expect(updated).toMatchObject({ id: u.id, isAdmin: true, disabled: true });
    const reread = await getRepo().getUserById(u.id);
    expect(reread).toMatchObject({ isAdmin: true, disabled: true });
  });

  it("returns null for an unknown id", async () => {
    expect(await getRepo().patchUser("nope", { disabled: true })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-26-patch-user.test.ts`
Expected: FAIL — `patchUser` is not on the Repository.

- [ ] **Step 3: Add `patchUser` to the interface**

In `repo/types.ts`, in the user-management section (near `setUserDisabled`):
```ts
  /** Apply isAdmin and/or disabled in a single atomic update. Null if unknown. */
  patchUser(id: string, change: { isAdmin?: boolean; disabled?: boolean }): Promise<UserSummary | null>;
```

- [ ] **Step 4: Implement in both repos**

In `memory.ts` (alongside `setUserDisabled`/`setUserAdmin`):
```ts
    async patchUser(id, change) {
      const u = users.get(id);
      if (!u) return null;
      if (change.isAdmin !== undefined) u.isAdmin = change.isAdmin;
      if (change.disabled !== undefined) u.disabled = change.disabled;
      return toUserSummary(u);
    },
```
(Match the existing `users` map + `toUserSummary` helper names in that file; if `setUserDisabled` reads them differently, mirror its style exactly.)

In `postgres.ts`:
```ts
    async patchUser(id, change) {
      const set: Partial<{ isAdmin: boolean; disabled: boolean }> = {};
      if (change.isAdmin !== undefined) set.isAdmin = change.isAdmin;
      if (change.disabled !== undefined) set.disabled = change.disabled;
      if (Object.keys(set).length === 0) {
        const [row] = await db.select().from(users).where(eq(users.id, id));
        return row ? toUserSummary(row) : null;
      }
      const [row] = await db.update(users).set(set).where(eq(users.id, id)).returning();
      return row ? toUserSummary(row) : null;
    },
```
(Use the file's existing `users` table import and `toUserSummary` projection; mirror `setUserAdmin`'s exact shape.)

- [ ] **Step 5: Use it in the route + invalidate the cache**

In `app/api/users/[id]/route.ts`, replace the two-call block (lines ~34-37) with:
```ts
  const summary = await getRepo().patchUser(id, change);
  if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (change.disabled === true) {
    const { invalidateUserActiveCache } = await import("../../../../src/server/auth/sessionUser");
    invalidateUserActiveCache(id);
  }
  return NextResponse.json({ user: summary });
```
(Keep the existing `assertCanModify` guard above it unchanged.)

- [ ] **Step 6: Verify**

Run: `npx vitest run apps/web/src/__tests__/slice-26-patch-user.test.ts` + the existing user-route/guard tests (`git grep -l "users-patch\|users-route\|user-guards" apps/web/src/__tests__`). All green. `npm run typecheck` 0, `npm run lint` 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix(users): atomic patchUser + invalidate session cache on disable (M-12, H-5)"
```

---

### Task 4: Generation rate limiting (M-2)

**Files:**
- Create: `apps/web/src/server/rateLimit.ts`
- Modify: `apps/web/app/api/generate/section/route.ts`, `apps/web/app/api/generate/field/route.ts`, `apps/web/app/api/generate/proposal/route.ts`, `apps/web/app/api/refine/section/route.ts`
- Test: `apps/web/src/__tests__/slice-26-rate-limit.test.ts`

**Interfaces:**
- Produces: `checkRateLimit(key: string, opts?: { now?: number }): { ok: boolean; retryAfterMs: number }` — an in-memory token bucket (capacity 20, refill 20 tokens / 60s) keyed by owner id. Plus `resetRateLimitForTests()`.
- **Honest limitation (document in the file header):** in-memory + per-instance. On Vercel serverless each instance has its own bucket, so this throttles a sustained burst on a warm instance but is not a global limit. A durable store (Vercel KV / Upstash) is the production upgrade; the `checkRateLimit` seam makes that swap local.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-26-rate-limit.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimitForTests } from "../server/rateLimit";

beforeEach(() => resetRateLimitForTests());
afterEach(() => resetRateLimitForTests());

describe("checkRateLimit (token bucket, capacity 20 / 60s)", () => {
  it("allows up to capacity then blocks, and refills over time", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) expect(checkRateLimit("owner", { now: t0 }).ok).toBe(true);
    const blocked = checkRateLimit("owner", { now: t0 });
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    // after a full refill window, allowed again
    expect(checkRateLimit("owner", { now: t0 + 60_000 }).ok).toBe(true);
  });

  it("buckets are per-key", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 20; i++) checkRateLimit("a", { now: t0 });
    expect(checkRateLimit("a", { now: t0 }).ok).toBe(false);
    expect(checkRateLimit("b", { now: t0 }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-26-rate-limit.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement the limiter**

Create `apps/web/src/server/rateLimit.ts`:
```ts
/**
 * In-memory token-bucket rate limiter (M-2). PER-INSTANCE on serverless — it
 * throttles a sustained burst on one warm instance, not a global limit. The
 * checkRateLimit seam isolates a future swap to a durable store (Vercel KV /
 * Upstash). Keyed by owner id at the generation routes (cost control).
 */
const CAPACITY = 20;
const REFILL_MS = 60_000; // full bucket per minute

interface Bucket {
  tokens: number;
  updated: number;
}
const buckets = new Map<string, Bucket>();

export function resetRateLimitForTests(): void {
  buckets.clear();
}

export function checkRateLimit(key: string, opts?: { now?: number }): { ok: boolean; retryAfterMs: number } {
  const now = opts?.now ?? Date.now();
  const refillRate = CAPACITY / REFILL_MS; // tokens per ms
  const b = buckets.get(key) ?? { tokens: CAPACITY, updated: now };
  const elapsed = Math.max(0, now - b.updated);
  const tokens = Math.min(CAPACITY, b.tokens + elapsed * refillRate);
  if (tokens < 1) {
    buckets.set(key, { tokens, updated: now });
    return { ok: false, retryAfterMs: Math.ceil((1 - tokens) / refillRate) };
  }
  buckets.set(key, { tokens: tokens - 1, updated: now });
  return { ok: true, retryAfterMs: 0 };
}
```

- [ ] **Step 4: Apply at the generation routes**

In each of the four routes, immediately AFTER the owner guard resolves (`owner` is the owner id string), before parsing/using the body's expensive path, add:
```ts
  const limit = checkRateLimit(owner);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many generation requests. Please wait a moment." },
      { status: 429, headers: { "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }
```
Import `checkRateLimit` from `../../../../src/server/rateLimit` (adjust depth per route). For `generate/proposal/route.ts` (which uses a bare `new Response`, not `NextResponse`), return the 429 in that route's style:
```ts
    return new Response(JSON.stringify({ error: "Too many generation requests. Please wait a moment." }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)) },
    });
```
Note `requireOwner()` returns the owner id string (or a Response) — the routes already capture it as `owner`; place the limit check right after the `if (owner instanceof Response) return owner;` line.

- [ ] **Step 5: Verify**

Run: `npx vitest run apps/web/src/__tests__/slice-26-rate-limit.test.ts` + the existing generate/refine route tests (they make a single call each, well under capacity, so they stay green — confirm). `npm run typecheck` 0, `npm run lint` 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): per-owner in-memory rate limit on generation routes (M-2)"
```

---

### Task 5: Data-integrity fixes — updatedAt bump + atomic snapshot (M-6)

**Files:**
- Modify: `apps/web/src/server/repo/postgres.ts`, `apps/web/src/server/repo/memory.ts`
- Test: `apps/web/src/__tests__/slice-26-repo-integrity.test.ts`

**Interfaces:**
- `updateProposalMeta` now bumps `updatedAt` (rename/move resurfaces the proposal in the `updatedAt`-sorted list).
- `snapshotVersion` captures the document in ONE atomic statement (no read-then-insert window). Neon HTTP has no interactive transactions, so use a single `INSERT … SELECT`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-26-repo-integrity.test.ts`:
```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";

beforeEach(() => setRepoForTests(createMemoryRepo()));
afterEach(() => setRepoForTests(null));

describe("repo integrity", () => {
  it("updateProposalMeta bumps updatedAt", async () => {
    const created = await getRepo().createProposal("o1", sampleProposal);
    const before = created.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const summary = await getRepo().updateProposalMeta(created.id, { title: "Renamed" });
    expect(summary).not.toBeNull();
    expect(summary!.updatedAt >= before).toBe(true);
    expect(new Date(summary!.updatedAt).getTime()).toBeGreaterThan(new Date(before).getTime());
  });

  it("snapshotVersion captures the current document", async () => {
    const created = await getRepo().createProposal("o1", sampleProposal);
    const ver = await getRepo().snapshotVersion(created.id);
    expect(ver).not.toBeNull();
    expect(ver!.document.id).toBe(created.id);
    expect(await getRepo().listVersions(created.id)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-26-repo-integrity.test.ts`
Expected: the `updatedAt` test FAILS (meta update doesn't bump it); the snapshot test likely passes already (it asserts behaviour the atomic version must preserve).

- [ ] **Step 3: Bump `updatedAt` in `updateProposalMeta`**

In `postgres.ts` `updateProposalMeta`, change the `.set(...)` to include the timestamp:
```ts
        .set({ document, folderId, updatedAt: new Date() })
```
In `memory.ts` `updateProposalMeta`, set `updatedAt: new Date().toISOString()` on the stored record (mirror how `saveProposal` updates it there).

- [ ] **Step 4: Make `snapshotVersion` atomic (Postgres)**

Replace the `postgres.ts` `snapshotVersion` body with a single `INSERT … SELECT` (atomic; no transaction needed — Neon HTTP can't do interactive transactions anyway):
```ts
    async snapshotVersion(proposalId) {
      const id = uid("ver");
      const result = await db.execute(sql`
        INSERT INTO proposal_versions (id, proposal_id, document, created_at)
        SELECT ${id}, id, document, now() FROM proposals WHERE id = ${proposalId}
        RETURNING id, proposal_id, document, created_at
      `);
      const rows = (result as unknown as { rows?: Record<string, unknown>[] }).rows
        ?? (result as unknown as Record<string, unknown>[]);
      const row = rows[0];
      if (!row) return null;
      return {
        id: row["id"] as string,
        proposalId: row["proposal_id"] as string,
        document: row["document"] as import("@proposal/shared").ProposalDocument,
        createdAt: new Date(row["created_at"] as string).toISOString(),
      };
    },
```
Add `import { sql } from "drizzle-orm";` if not already imported. (The driver-shape double-unwrap mirrors the existing pattern in this file — audit item M-11 will DRY all of these later; do NOT refactor them here.) The `memory.ts` `snapshotVersion` is already atomic in-process — leave it, just confirm it captures `document` by value (clone if the impl stores references).

- [ ] **Step 5: Verify**

Run: `npx vitest run apps/web/src/__tests__/slice-26-repo-integrity.test.ts` + existing repo + export tests (`slice-08-repo`, `slice-09-export`, `slice-14-proposals-repo`). All green. `npm run typecheck` 0, `npm run lint` 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(repo): bump updatedAt on meta update; atomic snapshotVersion (M-6)"
```

---

### Task 6: Database indexes (H-6) — schema + generated migration (NOT applied to prod)

**Files:**
- Modify: `apps/web/src/server/db/schema.ts` (add indexes)
- Create: `apps/web/drizzle/0008_*.sql` (generated) + drizzle meta updates
- Test: `apps/web/src/__tests__/slice-26-indexes-migration.test.ts` (asserts the generated SQL declares the indexes)

**Interfaces:**
- Adds B-tree indexes on the foreign-key-ish columns every list query filters by: `proposals(owner_id)`, `proposals(folder_id)`, `folders(owner_id)`, `themes(owner_id)`, `proposal_versions(proposal_id)`. No behaviour change — query results are identical, just not full-table scans.

- [ ] **Step 1: Add indexes to the schema**

In `apps/web/src/server/db/schema.ts`, import `index` and add the third table-config arg. Example for `proposals`:
```ts
import { boolean, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const proposals = pgTable(
  "proposals",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    folderId: text("folder_id"),
    document: jsonb("document").$type<ProposalDocument>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("proposals_owner_id_idx").on(t.ownerId), index("proposals_folder_id_idx").on(t.folderId)],
);
```
Do the same for: `folders` → `index("folders_owner_id_idx").on(t.ownerId)`; `themes` → `index("themes_owner_id_idx").on(t.ownerId)`; `proposalVersions` → `index("proposal_versions_proposal_id_idx").on(t.proposalId)`. (Use the array-return form `(t) => [ ... ]` for drizzle 0.38.)

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate -w @proposal/web`
Expected: a new `apps/web/drizzle/0008_<name>.sql` containing `CREATE INDEX ... ON "proposals" ("owner_id")` etc., plus updated `drizzle/meta`. Inspect the SQL — it must be ONLY `CREATE INDEX` statements (no destructive DDL).

- [ ] **Step 3: Write a guard test on the generated SQL**

Create `apps/web/src/__tests__/slice-26-indexes-migration.test.ts`:
```ts
// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("0008 index migration", () => {
  it("declares the owner/proposal indexes and is non-destructive", () => {
    const dir = join(process.cwd(), "apps/web/drizzle");
    const file = readdirSync(dir).find((f) => f.startsWith("0008") && f.endsWith(".sql"));
    expect(file, "0008 migration must exist").toBeTruthy();
    const sql = readFileSync(join(dir, file!), "utf8").toLowerCase();
    for (const idx of ["proposals_owner_id_idx", "folders_owner_id_idx", "themes_owner_id_idx", "proposal_versions_proposal_id_idx"]) {
      expect(sql).toContain(idx);
    }
    expect(sql).not.toMatch(/drop\s+table|drop\s+column/); // non-destructive
  });
});
```
(If `npm test` runs from the repo root, `process.cwd()` is the root — adjust the path if the web project runs tests with a different cwd; verify by running the single test.)

- [ ] **Step 4: Verify**

Run: `npx vitest run apps/web/src/__tests__/slice-26-indexes-migration.test.ts` → PASS. Full suite green (indexes don't change query results; the memory repo is unaffected). `npm run typecheck` 0, `npm run lint` 0.

- [ ] **Step 5: Commit (SQL only — do NOT apply to prod here)**

```bash
git add apps/web/src/server/db/schema.ts apps/web/drizzle apps/web/src/__tests__/slice-26-indexes-migration.test.ts
git commit -m "feat(db): index owner_id/folder_id/proposal_id (H-6) — migration 0008 (not yet applied)"
```

- [ ] **Step 6: Flag the production apply for the user**

In the task report, state clearly: **migration 0008 is generated and committed but NOT applied.** Applying requires the user's explicit go-ahead and the documented recipe (load `DATABASE_URL` from `.env.local` into the env for one command, then `npm run db:migrate -w @proposal/web`, redacting the URL in any output). `CREATE INDEX` on a small table is fast and non-locking-significant; on a large table prefer `CREATE INDEX CONCURRENTLY` (which can't run inside a migration transaction) — note this if the prod tables are already large.

---

## Self-Review

**1. Audit coverage:** Closes H-7 (Task 1), H-5 (Task 2), M-12 (Task 3), M-2 (Task 4), M-6 (Task 5), H-6 (Task 6). Deferred to later plans (noted, not built ahead): M-5 registry TTL, M-11 repo dedup/typed executeRaw, M-3 parallel generation, observability expansion, durable rate-limit store, and all of Phases 3–5.

**2. Placeholder scan:** All implementation code is concrete. The only "discover-then-do" steps are Task 1 Step 4 (grep call sites — bounded, typecheck-enforced) and Task 6 Step 2 (generated SQL — inspected + guard-tested). No vague intent.

**3. Type/consistency:** `verifyPassword`/`hashPassword` become `Promise`-returning (Task 1) — all callers awaited, typecheck-enforced. `invalidateUserActiveCache` (Task 2) is consumed by Task 3's route. `patchUser` is added to the interface (Task 3) and implemented in BOTH repos. `checkRateLimit` (Task 4) is self-contained. `updateProposalMeta`/`snapshotVersion` changes (Task 5) preserve their return types. Index names (Task 6) match between schema and the migration guard test. Ordering: Task 2 (cache) precedes Task 3 (invalidate consumer).

**Risk notes:** (a) Task 2's test mocks `../../auth` and uses the REAL `fromNextAuth` resolver — confirm the mock path resolves from the test file; if the import path differs, adjust. (b) Task 6's migration must be `CREATE INDEX` only — if `db:generate` emits anything destructive, STOP (it shouldn't for additive index changes). (c) Neon HTTP transactions are unsupported — Task 5 deliberately avoids `db.transaction()`.

## Execution Handoff

This plan implements audit **Phase 2** (security & scale). Two execution options:
1. **Subagent-Driven (recommended)** — fresh implementer + reviewer per task, on a branch `feat/audit-phase2-security-scale`.
2. **Inline Execution** — here with checkpoints.

**Note:** Task 6 generates a DB migration but does NOT apply it. Applying to production Neon is a separate step requiring your explicit authorization.

Which approach?
