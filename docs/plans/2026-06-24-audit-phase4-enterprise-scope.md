# Phase 4 — Enterprise product-fit: scoping document

**Date:** 2026-06-24
**Status:** SCOPING ONLY — no application code written. This document scopes the five Phase 4 themes from `AUDIT_REVIEW.md` Part II into independently shippable slices in the project's one-slice-at-a-time style.
**Predecessors:** Phases 0, 1b, 2, 3 (incl. M-3, M-9) are DONE & merged. Migration 0008 is live on prod Neon. Latest applied migration: **0008**; first Phase 4 migration is **0009**.

---

## Grounding: current state (verified against code)

- **Single-tenant, owner-scoped.** `owner_id` = `users.id`. Scoping is enforced at the **route layer** (`requireOwner`/`requireOwnedProposal`/`requireAdmin` in `apps/web/src/server/auth/guard.ts`), never in the `Repository` interface (`apps/web/src/server/repo/types.ts`). Cross-owner access returns 404 (no existence leak).
- **Owned resources carry `owner_id`:** `proposals`, `folders`, `themes` (`apps/web/src/server/db/schema.ts:5-51`). `proposal_versions` is scoped indirectly via `proposal_id`. `templates`, `section_types`, `section_layouts`, `app_settings` are **global / Builder-managed** (no owner).
- **Roles today are binary:** `users.is_admin` (boolean) + implicit "owner" of each resource. `users.disabled` for soft-disable. Guardrails in `userGuards.ts` (no self-lockout, keep >=1 active admin). Session revocation works via the 30s `isActive` cache in `sessionUser.ts` (H-5 closed).
- **No audit log.** No `audit_events` table; mutations are not recorded.
- **No soft-delete; versions unbounded.** `deleteProposal` (`postgres.ts:126`) hard-deletes the proposal AND all its versions. `snapshotVersion` (`postgres.ts:146`, atomic `INSERT...SELECT`) is called on every export and via `POST /versions` — **growth is unbounded**, no retention/pruning, no trash/restore.
- **Asset surface:** `POST /api/assets` (`apps/web/app/api/assets/route.ts`) — auth-gated, `image/*` only, 10 MB cap, key namespaced `assets/{owner}/{name}`, **`access: "public"`** Vercel Blob. CSV import (`/api/data/import`) — 5 MB cap, in-memory parse. **There is NO server-side image-by-URL / fetch-by-URL ingestion anywhere** (verified: `ImageField`/`AssetUpload` only POST local `File` objects; no `fetch(userUrl)`). So **SSRF is a forward-looking hardening item, not a live bug** — the only ingestion sinks are multipart file uploads.
- **Render token** (`renderToken.ts`) signs with `AUTH_SECRET`, throws in prod if unset (M-10 closed). This is the existing pattern to reuse for read-only client-preview links.
- **Repo abstraction is clean** — two impls (`memory.ts`, `postgres.ts`) behind one interface. Every Phase 4 schema change must land in BOTH and add tests; memory repo backs the test suite + zero-config dev.

---

## Theme 1 — Multi-tenant / workspaces

### Audit findings covered
- **Phase 4.1** (roadmap). No single severity ID; it is the "dead-end to break for selling into organisations" called out in section 1 ("a model that is a dead end for multi-tenant/workspace selling") and the Executive summary. Indirectly de-risks **H-6** (indexes must now cover `workspace_id`).

### Current state
- `owner_id` is the de-facto tenant boundary, but it equals an individual `users.id`. There is no concept of a shared workspace; two users cannot see the same proposal. `requireOwnedProposal` (`guard.ts:26`) compares `stored.ownerId !== owner`.
- Owned tables: `proposals.owner_id`, `folders.owner_id`, `themes.owner_id` (all indexed, 0008). `proposal_versions` inherits scope via `proposal_id`.
- `DEFAULT_OWNER = "owner_local"` (`repo/index.ts:27`) is a pre-auth stub still present.

### Target state
- A `workspaces` table and a `workspace_members(user_id, workspace_id, role)` join table. Owned resources scope by **`workspace_id`** instead of (or in addition to) `owner_id`. A user belongs to >=1 workspace; resources belong to a workspace; access is "is the acting user a member of this resource's workspace (with sufficient role)".
- `owner_id` is **retained** as "creator/author" provenance (useful for audit + future per-resource ownership), but it stops being the access-control key.

### Proposed sub-slices
1. **4.1a — Schema + backfill (migration 0009).** Add `workspaces(id, name, created_at)` and `workspace_members(workspace_id, user_id, role, created_at)` (composite PK `(workspace_id,user_id)`, index on `user_id`). Add **nullable** `workspace_id` to `proposals`, `folders`, `themes`. Data migration: create one "personal workspace" per existing user, add the user as `owner`/`admin` member, set every existing row's `workspace_id` from its `owner_id`'s personal workspace. Then a follow-up migration makes `workspace_id` `NOT NULL` + adds indexes once backfill is verified. Repo interface unchanged in this slice (writes both columns; reads still by owner). Ships dark.
2. **4.1b — Read/write path cutover.** Change `Repository` list/get methods from `ownerId` to a `scope: { workspaceId; userId }` (or add `workspaceId` params). Update `guard.ts` to resolve the acting user's workspace membership and switch `requireOwnedProposal` to a workspace-membership check. Both repos + route updates. This is the breaking behavioural slice.
3. **4.1c — Workspace switching + management UI.** Workspace selector, create/rename workspace, invite/remove members (depends on RBAC Theme 2 for member roles; can ship with owner-only first).

### Migrations
- 0009 (additive nullable `workspace_id` + new tables + backfill), then 0010 (NOT NULL + indexes after verification). Splitting avoids a long table-lock on a populated DB.

### Breaking changes & data migration
- **This is THE breaking schema change.** Existing single-owner data must map cleanly: one personal workspace per user, membership row, backfill `workspace_id`. The migration must be idempotent and reversible (keep `owner_id` populated so a rollback to route-layer owner scoping is possible).
- The `Repository` interface signature changes (owner -> workspace scope) — touches ~every route and both repo impls + every repo test. Sequence as 4.1a (dark, additive) -> 4.1b (cutover) so the risky data migration is separated from the risky code cutover.

### Risks / open questions / judgement calls
- **Q1: Personal-workspace model vs explicit-org model.** Does every user get an auto-created personal workspace (Notion-style), or is workspace creation an explicit admin action? Affects backfill and onboarding. **Needs user decision.**
- **Q2: Are global Builder resources (templates, section_types, layouts, ai_model) workspace-scoped or stay platform-global?** Today they are global. Per-workspace templates is a much larger change. Recommend: **keep global in Phase 4**, defer per-workspace branding to Phase 5 brand kits.
- **Q3:** Should `is_admin` (platform super-admin) survive alongside workspace roles? Recommend yes — platform admin (manages users, Builder, AI model) is orthogonal to workspace role.

### Dependencies & ordering
- **Must precede RBAC (Theme 2)** — roles live in `workspace_members.role`. Must precede the workspace-scoped audit log fields. 4.1a is the prerequisite for everything else in Phase 4 that references a workspace.

---

## Theme 2 — RBAC beyond admin/owner

### Audit findings covered
- **Phase 4.2** (roadmap): viewer / editor / approver roles; per-folder or per-proposal sharing; read-only client-preview links built on the render-token pattern. No standalone severity ID.

### Current state
- Two effective roles: platform `is_admin` (Builder + user mgmt) and resource "owner" (full control of own resources). No editor/viewer/approver. Guards: `requireAdmin` (`guard.ts:14`), `requireOwner`, `requireOwnedProposal`. No sharing primitive. No read-only external link (the render token is internal-only, single-proposal, 2-min TTL).

### Target state
- Workspace roles: `admin` (manage members/settings), `editor` (create/edit proposals), `viewer` (read-only), and optionally `approver` (can mark approved / gate export). Enforced server-authoritatively in the guard layer (mirroring the `userGuards.ts` server-authoritative pattern). Read-only **client-preview links** (shareable, longer-TTL, scoped to one proposal, no edit) built on the existing `renderToken` HMAC pattern.

### Proposed sub-slices
1. **4.2a — Role column + enforcement.** Use `workspace_members.role` (added in 4.1a). Add a `requireWorkspaceRole(min)` guard and a role hierarchy helper. Gate mutations on `editor+`, reads on `viewer+`. Guardrails mirror `userGuards.ts` (keep >=1 workspace admin, no self-demotion). Both repos + tests. **No new migration** (role lives in 4.1a's table) — or a tiny 0011 if role is added separately.
2. **4.2b — Client-preview (read-only share) links.** New signed-link primitive: extend `renderToken.ts` into a `shareToken` (proposal id + scope=`view` + longer TTL, optionally revocable via a `proposal_shares` table). A public `/share/[id]?t=` RSC renders read-only. Migration only if revocable links need persistence (`proposal_shares(id, proposal_id, token_hash, created_by, expires_at, revoked)`).
3. **4.2c — Per-proposal / per-folder sharing within a workspace** (finer than workspace-wide). Optional; defer unless demanded.

### Breaking changes & data migration
- Minimal if role ships in 4.1a's `workspace_members`. Backfill: existing members -> `admin` (they were owners). No proposal data migration.

### Risks / open questions / judgement calls
- **Q4: Which roles does the first release need?** Recommend minimal `admin / editor / viewer`; treat `approver` as Phase 5 (ties into an approval workflow that doesn't exist yet).
- **Q5: Are client-preview links revocable and/or password-protected?** Revocable needs a `proposal_shares` table + lookup on every render (vs stateless HMAC). Decision drives whether 4.2b needs a migration.
- **Q6:** Does a read-only viewer get PDF export? (Export currently snapshots a version — a side effect a viewer arguably shouldn't trigger.)

### Dependencies & ordering
- **Depends on Theme 1 (workspaces) for the role store.** 4.2b (share links) is independent of workspaces and could ship earlier as a standalone feature, but logically belongs after roles.

---

## Theme 3 — Audit log

### Audit findings covered
- **Phase 4.3** (roadmap): `audit_events` — who changed what, role changes, exports. "Table-stakes for SOC 2 / procurement." No standalone severity ID.

### Current state
- **Nothing is recorded.** User mutations (`PATCH /api/users/[id]`), role/disable changes, proposal create/update/delete, exports, Builder edits (template/section-type/layout/ai_model) leave no trail. The only "history" is `proposal_versions` (document snapshots, not an action log).

### Target state
- An append-only `audit_events` table capturing actor, action, target, workspace, timestamp, and a small JSON detail blob. Written from the route/guard layer at security- and compliance-relevant mutation points. Admin-viewable, filterable, exportable.

### Proposed sub-slices
1. **4.3a — Table + write helper (migration for `audit_events`).** `audit_events(id, workspace_id, actor_user_id, action, target_type, target_id, detail jsonb, created_at)` + indexes on `(workspace_id, created_at)` and `(actor_user_id)`. A `recordAuditEvent(...)` helper on the repo (both impls). Wire the highest-value events first: user disable/role change, login, export, proposal delete.
2. **4.3b — Broaden coverage + admin viewer UI.** Add Builder edits (template/section-type/layout/ai_model), proposal create/update, share-link creation. Admin `/admin` -> Audit view with filter/pagination.
3. **4.3c — Export / retention** of audit events (CSV/JSON), and retention policy (audit logs often must be retained LONGER than data — opposite of version retention).

### Migrations
- One additive migration for `audit_events`. Independent of workspaces if `workspace_id` is nullable initially; cleaner if it lands after 4.1a so the column is populated.

### Breaking changes & data migration
- None — purely additive. No backfill (audit starts from go-live; that is expected and defensible for compliance).

### Risks / open questions / judgement calls
- **Q7: Synchronous vs async writes.** Audit writes on the hot path add latency/failure surface. Recommend fire-and-forget with error logging, or a transactional outbox — but a failed audit write must NOT fail the user action (unless compliance requires it). **Needs decision.**
- **Q8: What is the minimum event set for the target compliance bar (SOC 2)?** Drives 4.3a scope.
- **Q9:** PII in `detail` — avoid storing passwords/secrets; define a redaction rule.

### Dependencies & ordering
- **Lightly depends on Theme 1** (for `workspace_id`). Can otherwise ship independently and early. Recommend after workspaces so events are workspace-attributed from day one.

---

## Theme 4 — Soft-delete + version retention

### Audit findings covered
- **Phase 4.4** (roadmap): bounded `proposal_versions` growth; restore from trash. Relates to **M-6** context (versioning) but M-6 itself (updatedAt/atomic snapshot) is already closed.

### Current state
- **Hard delete.** `deleteProposal` (`postgres.ts:126`) deletes versions then the proposal — irreversible. No trash, no restore.
- **Unbounded versions.** `snapshotVersion` runs on every export (`export/route.ts:34`) and via `POST /versions` — no cap, no pruning. A heavily-exported proposal accumulates rows forever. Indexed by `proposal_id` (0008) so reads are fine; storage/growth is the problem.

### Target state
- Soft-delete: `proposals.deleted_at` (nullable timestamp); deletes set it; lists exclude soft-deleted; a Trash view lists and restores; a purge job (or TTL) hard-deletes after N days. Version retention: keep last N versions and/or versions newer than M days per proposal; prune older on snapshot.

### Proposed sub-slices
1. **4.4a — Soft-delete proposals (migration: add `proposals.deleted_at`).** `deleteProposal` sets `deleted_at`; add `restoreProposal`; `listProposals` filters `deleted_at IS NULL`; `requireOwnedProposal` treats soft-deleted as 404 except on trash/restore routes. Partial index `WHERE deleted_at IS NULL`. Both repos + tests.
2. **4.4b — Trash UI + purge.** Trash view (list/restore/permanently delete); a scheduled purge (Vercel Cron) hard-deleting rows past the trash TTL. Hard delete still cascades versions (existing logic).
3. **4.4c — Version retention policy.** On `snapshotVersion`, prune versions beyond the configured cap (keep last N, or last N + any pinned). Optional `proposal_versions.pinned` column. Admin-configurable N via `app_settings`.

### Migrations
- 4.4a: add `proposals.deleted_at` + partial index. 4.4c: optional `proposal_versions.pinned` boolean. Both additive.

### Breaking changes & data migration
- Additive; no backfill (existing rows have `deleted_at = NULL` = live). Behavioural change: delete is now reversible — ensure all delete call sites + the folder-delete unfile path still behave.

### Risks / open questions / judgement calls
- **Q10: Trash TTL and version cap values?** e.g. 30-day trash, keep last 20 versions. **Needs decision.**
- **Q11:** Does soft-delete extend to folders/themes, or proposals only? Recommend proposals only first.
- **Q12:** Should export still auto-snapshot once retention prunes aggressively? (Interaction between "snapshot on every export" and "keep last N".)

### Dependencies & ordering
- **Independent** of workspaces/RBAC (operates on existing `proposals`/`proposal_versions`). Can ship early. Should respect workspace scoping if it lands after Theme 1 (trash is per-workspace), but functions standalone.

---

## Theme 5 — Asset / SSRF hardening

### Audit findings covered
- **Phase 4.5** (roadmap): content-type/size validation, virus scan hook, signed asset URLs, SSRF guards on URL ingestion. Builds on already-closed **H-4** (upload/import size limits — done in Phase 0).

### Current state
- `POST /api/assets`: auth-gated, `image/*` MIME check (`file.type.startsWith("image/")`, trusts client-declared type), 10 MB cap, owner-namespaced key, **`access: "public"`** (anyone with the URL reads it; URLs are unguessable but permanent). No magic-byte sniffing, no virus scan.
- `POST /api/data/import`: 5 MB cap, full in-memory CSV parse.
- **No URL-ingestion SSRF surface exists today** — verified no server-side `fetch(userProvidedUrl)`. SSRF guards are only needed IF a future "import image by URL" / "import from Google Drive" feature is added. This theme is therefore **partly hardening (real) + partly forward-looking (guard rails for a feature not yet built)**.

### Target state
- Content validated by magic bytes (not just declared MIME); optional AV scan hook; consider signed/expiring asset URLs (or keep public-unguessable, documented decision); a reusable SSRF-safe fetch wrapper ready BEFORE any by-URL ingestion ships (blocks private IP ranges, link-local, redirects to internal, non-http(s) schemes).

### Proposed sub-slices
1. **5a — Upload content hardening.** Magic-byte sniff on `/api/assets` (reject mismatch vs declared type); enforce an allowlist of concrete image types; reject SVG (XSS-in-SVG risk) or sanitize it. **No migration.**
2. **5b — SSRF-safe fetch utility (forward-looking).** A `safeFetch(url)` helper rejecting non-public hosts, private/link-local IPs, non-http(s) schemes, and re-validating after redirects. Land it as a tested utility now so any future by-URL import (Drive/Canva/URL) uses it from day one. **No migration.** No live caller yet — ships as library + tests.
3. **5c — Signed asset URLs / AV hook (optional, demand-driven).** Switch Blob to a model with signed/expiring URLs if leakage of permanent public URLs is a concern; add an AV-scan hook (e.g. on upload, async). Decision-gated.

### Migrations
- None (assets live in Vercel Blob, not Postgres).

### Breaking changes & data migration
- 5a (reject SVG / stricter sniff) could reject a previously-accepted upload flow — low risk. Signed URLs (5c) would change how stored URLs are consumed (existing public URLs in proposal JSON keep working; new ones differ) — a compatibility consideration.

### Risks / open questions / judgement calls
- **Q13: Is SSRF hardening needed now, or only when a by-URL import is built?** Recommend ship 5b (the utility) cheaply now, defer 5c. **Needs decision on priority.**
- **Q14:** Public unguessable Blob URLs vs signed/expiring — acceptable for client deliverables (PDFs embed logos; signed URLs expire and could break long-lived shares). **Needs decision.**
- **Q15:** Is AV scanning a procurement requirement? If not, defer.

### Dependencies & ordering
- **Fully independent.** 5a is a quick standalone hardening win. 5b is a cheap pre-emptive utility. Neither blocks nor is blocked by other themes.

---

## Recommended build sequence (across all five themes)

Order by **dependency, then risk-isolation, then value**:

1. **Theme 5a (upload content hardening)** — first. Tiny, standalone, no migration, immediate security value, zero coupling. Warm-up win.
2. **Theme 4a -> 4b (soft-delete + trash)** — independent of the breaking workspace change, high user value (irreversible delete is a real footgun today), additive migration only. Ship before the schema churn of Theme 1.
3. **Theme 1a (workspace schema + backfill, dark/additive)** — the breaking change, done deliberately and in isolation while everything still reads by owner. Verify the backfill on a prod clone.
4. **Theme 1b (read/write cutover to workspace scope)** — the behavioural cutover, immediately after 1a, with the full repo/route/test sweep.
5. **Theme 2a (RBAC roles + enforcement)** — directly on top of `workspace_members.role`; can't precede workspaces.
6. **Theme 3a -> 3b (audit log)** — after workspaces so events are workspace-attributed; before/with RBAC UI so role changes are audited from the start. (3a can be pulled earlier if a compliance deadline demands.)
7. **Theme 1c / 2b / 2c / 4c / 5b / 5c** — remaining slices, demand-driven (workspace mgmt UI, share links, per-resource sharing, version retention, SSRF utility, signed URLs/AV).

**Why workspaces sits in the middle, not first:** it is the riskiest, most expensive change and the audit explicitly says "don't pay the multi-tenant tax early." Themes 5a and 4 deliver value with zero coupling to it, so they de-risk the runway. But workspaces MUST precede RBAC and ideally precedes the audit log, so it cannot be deferred to the end.

**Single riskiest item:** Theme 1b (workspace read/write cutover) — it changes the `Repository` access-control contract used by every route, and a mistake means cross-tenant data exposure. Mitigation: split 1a (dark/additive + backfill) from 1b (cutover); keep `owner_id` populated for rollback; add explicit cross-workspace-isolation tests (the 404-not-403 invariant) before merge.

---

## Decisions needed before starting

1. **(Q1) Workspace model:** auto personal workspace per user vs explicit org creation.
2. **(Q2) Scope of global Builder resources:** keep templates/section-types/layouts/ai_model platform-global (recommended), or per-workspace.
3. **(Q4) Initial role set:** `admin/editor/viewer` (recommended) — is `approver` in scope now?
4. **(Q5/Q6) Client-preview links:** revocable+persisted (needs a table) vs stateless HMAC; do viewers get export?
5. **(Q10) Retention values:** trash TTL and per-proposal version cap.
6. **(Q7) Audit write semantics:** fire-and-forget vs must-succeed; minimum SOC 2 event set (Q8).
7. **(Q13/Q14) Asset hardening priority:** ship SSRF utility now? signed/expiring URLs vs public-unguessable?
