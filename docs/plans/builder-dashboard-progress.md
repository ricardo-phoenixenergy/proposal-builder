# Dashboard + folders — execution ledger

Plan: docs/plans/2026-06-21-dashboard-folders.md
Spec: docs/specs/2026-06-21-dashboard-folders-design.md
Mode: subagent-driven. Git repo, branch `feat/dashboard-folders` (commit per task; merge to main + push at the end).
Commands at REPO ROOT: single file `npx vitest run <path>`, full suite `npm test`, typecheck `npm run typecheck`, build `npm run build -w @proposal/web`, migration `npm run db:generate -w @proposal/web`.

**STATUS: COMPLETE (on branch feat/dashboard-folders).** All 12 tasks done + per-task reviewed. Final whole-branch review (opus): READY. Findings fixed (commit c91554d): dashboard one-click SignOutButton (was GET interstitial), folder edit/delete button styles, --ui-danger token.
Final state: full suite 284/284, typecheck 0, clean build. Pending: apply migration 0005 to prod DB + merge to main + push (deploy).

- [x] Task 1: repo memory — richer ProposalSummary + folderId + updateProposalMeta + duplicateProposal — review Approved (no Critical/Important). 4/4. commit 0e920f7. (postgres typecheck failure = intended Task-3 handoff.)
- [x] Task 2: repo memory — folders CRUD (deleteFolder unfiles) — review Approved, no issues. 2/2. commit f04a1f6.
- [x] Task 3: postgres parity + schema + migration 0005_bored_captain_marvel.sql (additive) — review Approved. typecheck 0; repo tests 6/6. commit 66bdc90. NOTE: repo updateProposalMeta isn't owner-scoped by design → Task 4 PATCH must use requireOwnedProposal (verify).
- [x] Task 4: POST folderId + PATCH /api/proposals/[id] — review Approved (PATCH guarded by requireOwnedProposal; foreign-folder 400; backward-compat POST). 4/4. commit 2f04e4c.
- [x] Task 5: POST /api/proposals/[id]/duplicate — controller-verified (matches brief; owner-scoped 401/404/201; 5-level imports). 2/2. commit 34421f5.
- [x] Task 6: /api/folders + /api/folders/[id] — review Approved (owner-scoped first-guard, correct depths/status codes). 2/2. commit 03ee77c. (Minor: no 401/PATCH-400 tests — gaps, not defects.)
- [x] Task 7: client persistence extend + folders.ts — review Approved (spec-exact; 4 proposal fns + folders module). 5/5, typecheck 0. commit 648a889. (Also fixed Task-6 test EOPT error → commit 5875e63.)
- [x] Task 8: editor /p/[id] + App id prop + back link — review Approved (loop-safe load guard, effects isolated, async params). 1/1, typecheck 0. commit a8dec73.
- [x] Task 9: dashboard page + container + grid/cards — review Approved (server/client split, search/sort, card actions, anchors). 3/3, typecheck 0. commit 11ae212.
- [x] Task 10: folder sidebar — review Approved (selectedFolderId/folders now real state, counts + visible filter correct, delete auto-selects All). 4/4, typecheck 0. commit 214d1e2. Deviation: generic rename/delete aria-labels (+title) to resolve a brief test/label collision — reviewer deems sound/preferred.
- [x] Task 11: new-proposal dialog — review Approved (template pick → applyTemplate → create → router.push; +New & empty-state wired; /p/new placeholder removed). 4/4, typecheck 0. commit 178d90c.
- [x] Task 12: styles + load-failure redirect + full verify — review Approved. FULL SUITE 284/284, typecheck 0, clean build (all routes). commit dda943d. Integration fixes: App.tsx "use client" (latent build break from Task 8/9), + next/navigation mock in 3 App-render tests.

## Minor findings (for final review triage)
- Task 1: `updateProposalMeta` move-only path stores `existing.document` without re-cloning (harmless — `getProposal` clones on read). Could `clone()` in the else branch for consistency.
- Task 4: `POST /api/proposals` does not validate that `folderId` belongs to the owner (in-spec; PATCH does). Low risk (a foreign folderId just won't match any of the owner's sidebar folders). Consider validating on POST like PATCH does.
- Task 4: no test for `null` folderId (unfile) on PATCH — logic correct but unverified.
- Task 9: empty-state guard is on raw `proposals` (not `visible`); behaviorally correct ("No matches." comes from ProposalGrid). Structural-only.
- Task 9: `handlers` object recreated each render (no memo); no current impact (cards aren't memoized). Wrap in useMemo if cards grow.
- Task 10: no test coverage for folder rename/delete CRUD paths (inherited from the plan's test template). Logic correct by inspection; add a test in a hardening pass.
