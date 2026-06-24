# Audit Phase 1b — Lint / Format / Hooks / Coverage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the engineering guardrail started in Phase 0 (CI) by adding the automated quality net — Prettier, type-aware ESLint, pre-commit hooks, and coverage reporting — and wiring them into CI, so every subsequent phase is written with the net in place.

**Architecture:** Pure tooling/config — no product behaviour changes. Prettier lands first (one isolated format-only commit) so the ESLint diff isn't tangled with reformatting. ESLint is introduced type-aware but scoped and calibrated to reach **zero errors** (warnings allowed and tracked) so CI stays green on day one. Hooks and coverage are additive.

**Tech Stack:** ESLint 9 (flat config) · typescript-eslint 8 · eslint-plugin-react-hooks · @next/eslint-plugin-next · Prettier 3 · husky 9 + lint-staged 15 · @vitest/coverage-v8. Node 20, npm workspaces.

## Global Constraints

- Commands at REPO ROOT. This IS a git repo; work on a branch off `main`. Commit per task.
- All new packages are **devDependencies** (the user authorised this tooling phase explicitly; this is the sanctioned scope for adding deps).
- **Do not change product behaviour.** ESLint `--fix` and Prettier may reformat/auto-fix, but no task may alter runtime logic. The full test suite (`npm test`) must stay green after every task; typecheck (`npm run typecheck`) must stay at 0.
- Match the existing code style to minimise churn: 2-space indent, double quotes, semicolons, trailing commas, ~100 col width.
- **Precondition (verify before starting):** the Phase-0 CI workflow's first run is green. If it is red because next-auth beta needs `AUTH_URL` at build, add `AUTH_URL: http://localhost:3000` to the build step's `env:` in `.github/workflows/ci.yml` as a pre-task fix (one line) so this phase doesn't stack on a broken pipeline.
- The ESLint config will need a short internal iteration loop to converge (flat config + type-checked + Next + monorepo always does); that is expected, not a failure. The target is `npm run lint` exiting 0 with **0 errors** (warnings permitted).

---

### Task 1: Prettier + one-time format pass

**Files:**
- Create: `.prettierrc.json`, `.prettierignore`
- Modify: root `package.json` (add `format` + `format:check` scripts; add `prettier` devDep)
- Modify: (format-only) most source files — an isolated reformatting commit

**Interfaces:**
- Produces: `npm run format` (writes) and `npm run format:check` (verifies) at the repo root; a Prettier config the ESLint task and the editor both honour.

- [ ] **Step 1: Install Prettier**

Run: `npm install -D -W prettier@^3`
(`-W` installs at the workspace root.)

- [ ] **Step 2: Add config**

Create `.prettierrc.json` (chosen to match the existing style, minimising the reformat diff):
```json
{
  "printWidth": 100,
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "tabWidth": 2
}
```

Create `.prettierignore`:
```
node_modules
**/dist
**/.next
**/coverage
package-lock.json
**/*.md
.git
```

- [ ] **Step 3: Add scripts**

In root `package.json` `scripts`, add:
```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

- [ ] **Step 4: Run the one-time format pass**

Run: `npm run format`
Then verify nothing logical changed: `npm run typecheck` (0 errors) and `npm test` (full suite still green). Inspect `git diff --stat` — changes must be whitespace/quote/wrapping only.

- [ ] **Step 5: Verify check passes**

Run: `npm run format:check`
Expected: "All matched files use Prettier code style!" (exit 0).

- [ ] **Step 6: Commit** (isolated format-only commit)

```bash
git add -A
git commit -m "style: adopt Prettier; one-time format pass (no logic change)"
```
(Commit body should note: format-only, suite green, typecheck 0.)

---

### Task 2: ESLint flat config (type-aware, calibrated to zero errors)

**Files:**
- Create: `eslint.config.mjs` (root)
- Modify: root `package.json` (add `lint` + `lint:fix` scripts; add eslint devDeps)
- Modify: (only if genuine errors surface) a small number of source files to fix real violations, or targeted `// eslint-disable-next-line <rule> -- reason` with justification

**Interfaces:**
- Produces: `npm run lint` (reports; exits non-zero only on **errors**) and `npm run lint:fix` at the repo root, covering `packages/shared` and `apps/web`.

- [ ] **Step 1: Install ESLint + plugins**

Run:
```bash
npm install -D -W eslint@^9 typescript-eslint@^8 @eslint/js@^9 eslint-plugin-react-hooks@^5 @next/eslint-plugin-next@^15 globals@^15
```

- [ ] **Step 2: Add the flat config**

Create `eslint.config.mjs`:
```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";

export default tseslint.config(
  // 0. Never lint build output, deps, generated, or config files.
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/coverage/**", "**/*.config.{js,mjs,ts}", "**/*.d.ts"] },

  // 1. Baseline (no type info needed) — applies to all TS/TSX incl. tests.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 2. Type-checked rules — SOURCE ONLY (tests excluded; they live in a separate tsconfig).
  //    This is where the high-value bug-catchers live (floating/misused promises).
  {
    files: ["packages/shared/src/**/*.ts", "apps/web/src/**/*.{ts,tsx}", "apps/web/app/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/__tests__/**"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },

  // 3. React / Next rules for the web app.
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "@next/next": nextPlugin },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // 4. Project-wide rule tuning (keep CI green on adoption; tighten later).
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // 5. Tests: relax (Node globals; allow the project's test casts).
  {
    files: ["**/*.test.{ts,tsx}", "**/__tests__/**", "**/vitest.setup.ts"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
```

- [ ] **Step 3: Add scripts**

In root `package.json` `scripts`:
```json
"lint": "eslint .",
"lint:fix": "eslint . --fix"
```

- [ ] **Step 4: Calibrate** (the one genuinely iterative step)

Run: `npm run lint`. Then:
1. **Autofix** the trivially-fixable: `npm run lint:fix`, re-run `npm test` + `npm run typecheck` to confirm fixes changed nothing logical, and inspect the diff.
2. **Triage the remaining ERRORS** (warnings are fine to leave):
   - If an error is a **genuine bug or smell** and the fix is local + behaviour-preserving → fix it.
   - If a rule produces **many** errors that are stylistic/low-value or would require risky changes → downgrade that rule to `"warn"` in config block 4, with a one-line `// reason` comment. Record which rules you downgraded and the warning counts in your report.
   - For a **handful** of unavoidable, justified exceptions → `// eslint-disable-next-line <rule> -- <reason>` (the reason is mandatory).
   - Do NOT make risky logic changes to satisfy a linter. Behaviour preservation beats a clean report.
3. Re-run until `npm run lint` exits **0** (errors = 0). Warnings are allowed and will show in CI output.

Record the final error count (must be 0), the warning count, and any rules downgraded, in `.git/sdd/task-2-report.md`.

- [ ] **Step 5: Verify nothing regressed**

Run: `npm test` (full suite green) and `npm run typecheck` (0). Any file you edited to satisfy a lint rule must not change behaviour.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add type-aware ESLint flat config (calibrated to zero errors)"
```

---

### Task 3: Wire lint+format into CI and add pre-commit hooks

**Files:**
- Modify: `.github/workflows/ci.yml` (add lint + format:check steps)
- Modify: root `package.json` (add `lint-staged` config; add `prepare` script; add husky/lint-staged devDeps)
- Create: `.husky/pre-commit`

**Interfaces:**
- Produces: CI fails on lint errors or unformatted files; a pre-commit hook that runs eslint --fix + prettier on staged files only.

- [ ] **Step 1: Install husky + lint-staged**

Run: `npm install -D -W husky@^9 lint-staged@^15`

- [ ] **Step 2: Initialise husky**

Run: `npx husky init` (creates `.husky/pre-commit` and adds a `prepare` script). Replace the generated `.husky/pre-commit` contents with:
```sh
npx lint-staged
```

- [ ] **Step 3: Add lint-staged config**

In root `package.json`, add:
```json
"lint-staged": {
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,css,yml,yaml}": ["prettier --write"]
}
```
Confirm `"prepare": "husky"` is present in `scripts` (added by `husky init`).

- [ ] **Step 4: Add CI steps**

In `.github/workflows/ci.yml`, add two steps in the `verify` job **after** `npm ci` and **before** `npm run typecheck`:
```yaml
      - run: npm run format:check
      - run: npm run lint
```

- [ ] **Step 5: Verify**

- `npm run format:check` → exit 0. `npm run lint` → exit 0 (errors).
- Test the hook: stage a deliberately mis-formatted `.ts` file and run `git commit` on a throwaway change; confirm the hook reformats it (then discard the throwaway). Document the hook firing in the report.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "ci: enforce lint + format; add husky pre-commit (lint-staged)"
```

---

### Task 4: Coverage reporting

**Files:**
- Modify: `vitest.workspace.ts` (or add a root `vitest.config.ts`) for coverage config
- Modify: root `package.json` (add `test:coverage` script; add `@vitest/coverage-v8` devDep)
- Modify: `.gitignore` (ensure `coverage/` ignored — it already is per the audit)

**Interfaces:**
- Produces: `npm run test:coverage` → text summary + HTML report under `coverage/`. **No hard thresholds initially** (reporting only) so it never blocks CI; a ratchet is a future step.

- [ ] **Step 1: Install the provider**

Run: `npm install -D -W @vitest/coverage-v8@^2` (match the installed vitest 2.x).

- [ ] **Step 2: Configure coverage**

Add a coverage config. If `vitest.workspace.ts` defines a root config object, add a `test.coverage` block there; otherwise create a root `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      include: ["packages/shared/src/**/*.ts", "apps/web/src/**/*.{ts,tsx}", "apps/web/app/**/*.{ts,tsx}"],
      exclude: ["**/*.test.*", "**/__tests__/**", "**/*.d.ts"],
      // No thresholds yet — reporting only. Add a ratchet (e.g. lines: 70) in a later phase.
    },
  },
});
```
(If a root config already exists, merge the `coverage` block rather than overwriting.)

- [ ] **Step 3: Add the script**

In root `package.json` `scripts`: `"test:coverage": "vitest run --coverage"`.

- [ ] **Step 4: Verify**

Run: `npm run test:coverage`. Expected: suite passes and a coverage table prints; `coverage/` is created and is gitignored (`git status` shows it untracked/ignored). Record the headline line/branch/function % in the report (informational baseline).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: add v8 coverage reporting (no thresholds yet)"
```

---

## Self-Review

**1. Audit coverage:** Closes the deferred Phase-1 tooling tail from `AUDIT_REVIEW.md` (M1 ESLint, M2 Prettier, H2 pre-commit hooks, M5 coverage). CI enforcement (H1) was started in Phase 0 and is extended here with lint + format gates.

**2. Placeholder scan:** All config/code is concrete. Task 2 Step 4 (calibration) is a decision *procedure*, not a placeholder — the exact set of source-file fixes is genuinely unknowable until ESLint runs once, which is inherent to introducing a linter to an existing codebase. The procedure, rule thresholds, downgrade levers, and the hard target (0 errors, suite green, typecheck 0) are all specified.

**3. Consistency:** Prettier config (Task 1) is honoured by lint-staged (Task 3) and `format:check` in CI (Task 3). ESLint scripts (Task 2) are consumed by CI and the pre-commit hook (Task 3). Coverage (Task 4) is independent. Task ordering (Prettier → ESLint → wire-in → coverage) ensures the format pass lands before ESLint so diffs stay legible, and hooks/CI are wired only after both `lint` and `format:check` exist and pass.

**Risk note:** the one task that can over-run is Task 2's calibration. The mitigation is the explicit "downgrade noisy rules to warn rather than make risky fixes" rule — adoption favours a green pipeline with tracked warnings over a heroic cleanup. A dedicated warnings-burndown can be its own later chore.

## Execution Handoff

This plan implements audit **Phase 1b** (the tooling tail). Two execution options:
1. **Subagent-Driven (recommended)** — fresh implementer + reviewer per task, on a branch `feat/audit-phase1b-tooling`.
2. **Inline Execution** — here with checkpoints.

Which approach?
