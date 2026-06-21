# Builder user-management — execution ledger

Plan: docs/plans/2026-06-18-builder-user-management.md
Spec: docs/specs/2026-06-18-builder-user-management-design.md
Mode: subagent-driven, no git (checkpoints = named test file(s) pass + typecheck green).

**STATUS: COMPLETE.** All 11 tasks done + per-task reviewed. Final whole-branch review (opus): READY — no Critical/Important.
Final state: full suite 220/220, typecheck exit 0, clean `next build` (/api/users[/[id][/password]] registered + middleware).
Deferred Minor findings (final review: all acceptable): T1 (localeCompare ISO sort / toSummary unexported), T6 (untrimmed password stored — round-trips with sign-in), T10 (create-form reset not asserted in test). No git → finishing-a-development-branch step is N/A.

- [x] Task 1: repo types + in-memory user methods — review Approved; fixed Important (DuplicateEmailError now gets original email). 5/5 pass. Postgres typecheck failure is the intended Task-2 handoff.
- [x] Task 2: postgres parity + migration 0003_fixed_morgan_stark.sql (additive) — review Approved, no Critical/Important. typecheck exit 0; repo test 5/5.
- [x] Task 3: authenticateUser rejects disabled — review Approved (guard after verifyPassword, real end-to-end test). 2/2. (hashPassword is sync scryptSync — reviewer's async flag is moot.)
- [x] Task 4: isValidEmail helper — controller-verified against brief (matches exactly; all 6 reject cases correct). 2/2.
- [x] Task 5: assertCanModify guards — review Approved (conditions exact, hermetic tests). Added JSDoc note (actor pre-authenticated upstream) + clarified test comment. 7/7.
- [x] Task 6: GET + POST /api/users — review Approved (admin-gated, no passwordHash leak, 400/409/201 exact). 5/5.
- [x] Task 7: PATCH /api/users/[id] — review Approved (guard-before-apply, GuardError→409, setUserAdmin then setUserDisabled, 400/404/409/200). 6/6.
- [x] Task 8: POST /api/users/[id]/password — review Approved, no issues (admin-gated, trim<8→400, false→404, {ok:true}, never echoes pw; real verifyPassword test). 4/4.
- [x] Task 9: client/users.ts — controller-verified (matches brief; import type only, no server runtime; 4 exports). 5/5.
- [x] Task 10: UsersView — review Approved (guard mirroring exact: Disable/Revoke lock on self OR sole-active-admin; Enable/Make-admin never lock). 3/3. Reviewer I1 (tooltip) was a misread — `lockReason` ternary is correct.
- [x] Task 11: wire dashboard + page + styles + docs + full verify — review Approved. FULL SUITE 220/220, typecheck 0, clean build (/api/users[/[id][/password]] present). CSS tokens corrected to --ui-line-strong/--ui-panel/--ui-ink (per plan's escape clause).

## Workspace command corrections (plan used wrong forms)
- Single test file: `npx vitest run <path-from-repo-root>` (NOT `npm run test -w @proposal/web -- run ...` — there is no `test` script in the web workspace).
- Full suite: `npm test` (root). Typecheck: `npm run typecheck` (root). Build: `npm run build -w @proposal/web`. Migrations: `npm run db:generate -w @proposal/web`.

## Minor findings (for final review triage)
- Task 1: `listUsers` uses `localeCompare` for ISO sort (fine; plain `<`/`>` would be marginally more defensive). `toSummary` not exported (not needed today).
- Task 6: password stored untrimmed (length gate uses trimmed). Consistent with sign-in (verifyPassword uses raw password, no trim) and matches plan — not a defect.
- Task 10: create-form test doesn't assert fields are cleared after create (impl does reset). Minor coverage gap; consider adding in final pass.
