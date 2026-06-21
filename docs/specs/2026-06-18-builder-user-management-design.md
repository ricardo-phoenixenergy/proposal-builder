# Builder — User Management (design)

> Second increment of the in-app Builder (§11), after section-type authoring
> (`2026-06-18-builder-section-types-design.md`). Lets an admin create, list,
> disable, role-manage, and password-reset accounts from the `/admin` dashboard,
> filling the dashboard's existing disabled **Users** nav slot. Template authoring
> is the next-and-final Builder increment.

## Goal

An admin can manage the people who can sign in — without touching the CLI or the
database — from the Builder dashboard:

- **Create** an account (email + password, optionally admin).
- **List** all accounts with their role and status.
- **Disable / re-enable** an account (reversible; no hard delete — disabled users
  cannot sign in but their owner-scoped proposals are preserved).
- **Promote / demote** admin rights on an existing account.
- **Reset** any account's password (admin sets a new one; no email/reset-link infra).

Bootstrapping the first admin stays the CLI path
(`npm run user:create -w @proposal/web -- --admin <email> <password>`); everything
else moves to the frontend.

## Decisions (settled in brainstorming)

1. **Lifecycle: disable, not delete.** Add a `disabled` boolean to `users`.
   Hard delete is out of scope — it would orphan `proposals.owner_id`.
2. **Roles: create + promote/demote** from the UI, behind guardrails (below).
3. **Passwords: admin-set reset.** An admin types a new password; the server
   scrypt-hashes it. No self-service reset, no email — deferred.

### Guardrails (server-authoritative; UI mirrors them)

The acting admin's id comes from `requireAdmin()`. Two invariants, enforced on the
server (the UI also disables the offending buttons, but the server is the gate):

- **No self-lockout.** You cannot disable or demote *your own* account.
- **Keep one active admin.** No action may drop the count of *active admins*
  (`isAdmin === true && disabled === false`) to zero. This single rule covers both
  "demote the last admin" and "disable the last admin".

Both rejections return **409 Conflict** with an `error` message.

### Known limitation (accepted)

Sessions are **stateless JWTs**. Disabling or demoting a user takes full effect at
their **next sign-in** — a user with a live token keeps it until it expires
(`authenticateUser` is the gate, and it only runs at sign-in). Force-revoking live
sessions would require a per-request DB lookup on every route, which is out of
scope for this increment. This is documented in the spec and in `.env`/auth notes;
not a defect.

---

## A. Data model

Add one column to the existing `users` table (`apps/web/src/server/db/schema.ts`):

```ts
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  disabled: boolean("disabled").notNull().default(false), // NEW
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- Generate migration `0003_*` via `npm run db:generate -w @proposal/web`
  (adds `disabled boolean not null default false`; backfills existing rows to `false`).
- `StoredUser` (`apps/web/src/server/repo/types.ts`) gains `disabled: boolean`.
- New summary type for the list endpoint — **never carries `passwordHash`**:

```ts
export interface UserSummary {
  id: string;
  email: string;
  isAdmin: boolean;
  disabled: boolean;
  createdAt: string;
}
```

## B. Auth change

`authenticateUser` (`apps/web/src/server/auth/credentials.ts`) rejects a disabled
account — after the password check (so a disabled user can't probe password
validity via differential responses; both paths return `null` anyway):

```ts
const user = await getRepo().getUserByEmail(email);
if (!user) return null;
if (!verifyPassword(password, user.passwordHash)) return null;
if (user.disabled) return null; // NEW — disabled accounts cannot sign in
return { id: user.id, email: user.email, isAdmin: user.isAdmin };
```

## C. Repository methods

Extend the `Repository` interface and **both** implementations (memory + postgres):

```ts
listUsers(): Promise<UserSummary[]>;                       // no passwordHash, sorted by createdAt
setUserDisabled(id: string, disabled: boolean): Promise<UserSummary | null>;  // null if unknown id
setUserAdmin(id: string, isAdmin: boolean): Promise<UserSummary | null>;
setUserPassword(id: string, passwordHash: string): Promise<boolean>;          // false if unknown id
countActiveAdmins(): Promise<number>;                     // isAdmin && !disabled
getUserById(id: string): Promise<StoredUser | null>;      // backs guard checks
```

Changes to existing methods / repos:

- `createUser` gains **duplicate-email rejection in the memory repo** (Postgres
  already enforces `email` UNIQUE). The memory repo currently overwrites by
  normalized-email key; instead it throws a tagged error the route maps to 409.
  Define a shared sentinel so both repos surface duplicates the same way:

  ```ts
  export class DuplicateEmailError extends Error {}
  ```

  Memory `createUser`: if the normalized email already exists, `throw new DuplicateEmailError()`.
  Postgres `createUser`: catch the unique-violation (`code === "23505"`) and rethrow
  as `DuplicateEmailError`.
- The memory repo keys users by email today; `getUserById`/`setUser*` need id lookup.
  Keep the email-keyed `Map` and scan its values by id (small N; mirrors how
  `listInUseTypeKeys` scans). No second index needed.

`UserSummary` is derived by stripping `passwordHash` from `StoredUser`.

## D. Guard helper

A small server helper centralises the two guardrails so every route and test
shares one implementation (`apps/web/src/server/auth/userGuards.ts`):

```ts
/** Throws a tagged error if the change is forbidden; otherwise resolves. */
export async function assertCanModify(
  actingAdminId: string,
  targetId: string,
  change: { disabled?: boolean; isAdmin?: boolean },
): Promise<void>;
```

Logic:

- **Self-lockout:** if `targetId === actingAdminId` and (`change.disabled === true`
  or `change.isAdmin === false`) → throw `GuardError("You can't disable or demote your own account")`.
- **Last active admin:** if the change would *remove* an active admin
  (demoting an active admin, or disabling an active admin) **and**
  `countActiveAdmins() === 1` and the target *is* that active admin →
  throw `GuardError("There must be at least one active admin")`.

Routes map `GuardError` → 409. (Password reset is not gated by these rules — an
admin may reset anyone's password, including their own.)

## E. API routes (all admin-gated via `requireAdmin`)

Mirror the section-types route patterns (guard → validate → mutate → respond).

| Route | Method | Body | Success | Errors |
|---|---|---|---|---|
| `/api/users` | `GET` | — | `200 { users: UserSummary[] }` | 401/403 |
| `/api/users` | `POST` | `{ email, password, isAdmin? }` | `201 { user: UserSummary }` | 400 invalid, 409 duplicate, 401/403 |
| `/api/users/[id]` | `PATCH` | `{ disabled?, isAdmin? }` | `200 { user: UserSummary }` | 400 invalid/empty, 404 unknown, 409 guard, 401/403 |
| `/api/users/[id]/password` | `POST` | `{ password }` | `200 { ok: true }` | 400 empty/weak, 404 unknown, 401/403 |

Validation rules:

- **email**: trimmed, non-empty, contains `@` with non-empty local and domain parts
  (minimal shape check — a small `isValidEmail(s: string): boolean` helper; we are
  not RFC-validating). Stored lowercased (repo already normalizes).
- **password**: non-empty after trim, **minimum 8 characters** (create and reset).
- `PATCH` with neither `disabled` nor `isAdmin` present → 400 (nothing to do).
- `PATCH` applies guards via `assertCanModify` *before* writing. When both fields
  are present, guard-check the combined change, then apply both.
- Password reset route is separate (mirrors the `/deprecate` sub-route precedent),
  keeping the sensitive op isolated and never echoing the password back.

Every mutation route returns the fresh `UserSummary` so the client updates without
a follow-up GET (except password reset, which returns `{ ok: true }`).

## F. UI

### Dashboard shell

Enable the **Users** nav item in `AdminDashboard.tsx` and give the shell nav state
so it switches its `<main>` between two panels:

- `panel === "section-types"` → existing `<SectionTypeList>` (unchanged).
- `panel === "users"` → new `<UsersView>`.

The shell still receives `sectionTypes`/`inUse` as props; it fetches users
client-side on first switch to the Users panel (the `/admin` page server component
need not preload users). Keep the Templates nav item disabled.

### `UsersView` (`apps/web/src/ui/admin/UsersView.tsx`, `"use client"`)

- On mount: `GET /api/users` → table of accounts. Loading + error states reuse the
  store `notify` toast pattern that `SectionTypeList` uses.
- **Table** rows: email · role badge (`admin` / `member`) · status badge
  (`disabled` shown when true) · created date. Mirrors `stlist__*` markup/classes.
- **Create form** (inline, like `SectionTypeEditor` entry): email, password,
  "Admin" checkbox → `POST /api/users`; on success prepend the returned summary.
  Surface 400/409 messages inline.
- **Per-row actions**:
  - **Enable / Disable** → `PATCH { disabled }`.
  - **Make admin / Revoke admin** → `PATCH { isAdmin }`.
  - **Set password** → small prompt/inline field → `POST /api/users/[id]/password`.
- **Guard mirroring**: the current admin's own row has Disable and Revoke-admin
  disabled (self-lockout); when there is exactly one active admin, that admin's
  Disable and Revoke-admin are disabled with a title explaining why. The server
  still enforces both — the UI disabling is courtesy, not security. The acting
  admin's id is needed client-side for the self-row check; pass it as a prop from
  the server component (`session.user.id`).

### Client fetch module (`apps/web/src/client/users.ts`)

```ts
export async function fetchUsers(): Promise<UserSummary[]>;
export async function createUser(input: { email: string; password: string; isAdmin: boolean }): Promise<UserSummary>;
export async function updateUser(id: string, change: { disabled?: boolean; isAdmin?: boolean }): Promise<UserSummary>;
export async function setUserPassword(id: string, password: string): Promise<void>;
```

Each throws `Error(body.error ?? fallback)` on non-ok, matching `sectionTypes.ts`.
`UserSummary` is re-exported for the client from a shared-safe location (it's a
plain interface; define it in `repo/types.ts` and import the type into the client —
types erase at build, no server code is pulled in).

## G. Testing (TDD, hermetic)

Reuse the existing seams: in-memory repo (`setRepoForTests`), `requireAdmin` via
`setSessionUserResolverForTests`, mocked `fetch` for client/UI.

- **repo** (`memory` + shared contract): `listUsers` omits `passwordHash` and is
  sorted; `setUserDisabled`/`setUserAdmin` round-trip and return null on unknown id;
  `setUserPassword` returns false on unknown id; `countActiveAdmins` counts only
  `isAdmin && !disabled`; `createUser` throws `DuplicateEmailError` on a repeat email.
- **auth**: `authenticateUser` returns null for a disabled user with the correct
  password; still succeeds for an enabled user.
- **guards** (`assertCanModify`): self-disable rejected; self-demote rejected;
  disabling the sole active admin rejected; demoting the sole active admin rejected;
  disabling a non-last admin allowed; disabling/demoting *another* admin when two
  exist allowed.
- **routes**: GET admin-gated (401 unauth, 403 non-admin, 200 admin); POST create
  (201, 400 bad email, 400 short password, 409 duplicate); PATCH (disable/enable,
  promote/demote, 400 empty body, 404 unknown, 409 self-guard, 409 last-admin);
  password POST (200, 400 short, 404 unknown).
- **client/UI**: `UsersView` renders the list from mocked `fetch`; create flow posts
  and prepends; disable/role toggles call PATCH and reflect the new badge; password
  set posts; self-row and last-admin buttons render disabled. Dashboard nav switches
  panels.

## File map

**Create**
- `apps/web/app/api/users/route.ts` (GET, POST)
- `apps/web/app/api/users/[id]/route.ts` (PATCH)
- `apps/web/app/api/users/[id]/password/route.ts` (POST)
- `apps/web/src/server/auth/userGuards.ts` (`assertCanModify`, `GuardError`)
- `apps/web/src/server/auth/email.ts` (`isValidEmail`)  ← or inline in the route if trivial
- `apps/web/src/client/users.ts`
- `apps/web/src/ui/admin/UsersView.tsx`
- Tests alongside each.

**Modify**
- `apps/web/src/server/db/schema.ts` (+`disabled`)
- `apps/web/drizzle/0003_*.sql` (generated)
- `apps/web/src/server/repo/types.ts` (`StoredUser.disabled`, `UserSummary`, `DuplicateEmailError`, new `Repository` methods)
- `apps/web/src/server/repo/memory.ts` + `postgres.ts` (implement new methods; dup-email)
- `apps/web/src/server/auth/credentials.ts` (reject disabled)
- `apps/web/src/ui/admin/AdminDashboard.tsx` (nav state + Users panel; accept `currentUserId`)
- `apps/web/app/admin/page.tsx` (pass `session.user.id` to the dashboard)
- `.env.local.example` / auth notes (document the JWT mid-session-revocation limitation)

## Out of scope

- Hard delete of accounts.
- Self-service password reset, email/reset-link flows, password-strength meters
  beyond the 8-char minimum.
- Force-revoking live sessions (JWT limitation above).
- Template authoring (next increment).
