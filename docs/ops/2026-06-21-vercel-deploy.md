# Vercel Deployment Runbook

**Goal:** deploy the app to Vercel with Postgres (Neon), auth, AI generation, blob uploads, and PDF export working.

**Architecture notes that shape the setup:**
- **Monorepo** (npm workspaces). The deployable is `apps/web` (Next.js 15 App Router). It transpiles `@proposal/shared` (raw TS) via `transpilePackages` — no prebuild step needed.
- **DB:** Neon, added through the Vercel Marketplace (auto-injects `DATABASE_URL`). Required in production for sign-in, persistence, and export (in-memory won't do).
- **Auth:** next-auth v5, JWT sessions. Needs `AUTH_SECRET`; it trusts the Vercel host automatically (detects the `VERCEL` env).
- **PDF export:** the export route runs on the Node runtime and, on Vercel, launches `puppeteer-core` + `@sparticuz/chromium-min`, fetching a Chromium "pack" tar at cold start. Works out of the box; may need extra function memory.

**Decision (made):** **Vercel-first order** — push to GitHub, import to Vercel, provision Neon **natively in Vercel** (Marketplace), then pull that same config to local with `vercel env pull`. One database + one set of secrets, no hand-copying connection strings.

---

## Steps

### 0. Version control — DONE ✅
Repo initialised, committed, and pushed to `https://github.com/ricardo-phoenixenergy/proposal-builder.git` (branch `main`). `.gitignore` keeps `.env*.local` out of git. Future changes: `git add -A && git commit && git push`.

### 1. Import the project into Vercel
- vercel.com → **Add New → Project** → import the repo.
- **Root Directory → `apps/web`** (Edit it). Vercel auto-detects **Next.js**.
- Keep **"Include source files outside of the Root Directory"** ON (it is, for a detected monorepo) so `packages/shared` is available to the build.
- Leave Build = `next build` and Install command as default (Vercel installs at the repo root for npm workspaces). Set the Node version to 20+ in Project Settings if prompted.

### 2. Provision Neon (Marketplace integration)
- Project → **Storage** → add **Neon** (Marketplace) → create/connect a database → link it to this project for **Production and Preview**.
- It injects `DATABASE_URL` (plus `DATABASE_URL_UNPOOLED` / `PG*`). Confirm `DATABASE_URL` shows up under **Settings → Environment Variables**.

### 3. Add the remaining environment variables
Project → **Settings → Environment Variables** (apply to **Production and Preview**):
- `AUTH_SECRET` = a freshly generated secret (`npx auth secret` locally, or `openssl rand -base64 32`). **Required.**
- `ANTHROPIC_API_KEY` = your key — for AI generation. Server-only; **never** prefix with `NEXT_PUBLIC_`.
- `CHROMIUM_PACK_URL` = *(optional)* override for the Chromium pack tar; the default GitHub release works.

### 4. Add a Blob store (only if you want logo/image uploads)
- Storage → **Blob** → create a store → link to the project. It injects `BLOB_READ_WRITE_TOKEN`. Skip if you won't upload assets.

### 5. Migrate the production database (the build does NOT create the schema)
From your machine, point drizzle at the **production** Neon URL once (and after any future schema change):
- **PowerShell:** `$env:DATABASE_URL = "<prod Neon URL ?sslmode=require>"; npm run db:migrate -w @proposal/web`
- **bash:** `DATABASE_URL="<prod Neon URL>" npm run db:migrate -w @proposal/web`

Get the prod URL from Vercel (Settings → Environment Variables → reveal `DATABASE_URL`) or the Neon dashboard. Use the **direct (unpooled)** URL if the pooler rejects migrations. (Alternative: paste `apps/web/drizzle/0000…0004*.sql` into Neon's SQL editor in order.)

### 6. Create the first admin on production
```
$env:DATABASE_URL = "<prod Neon URL>"; npm run user:create -w @proposal/web -- --admin you@company.com "strong-pass"
```
Make sure the exported `DATABASE_URL` is the **prod** one for this command (note: `user:create` also auto-loads `apps/web/.env.local`, so an inline/exported var should point at prod to avoid seeding your dev DB by mistake). After this, create all other accounts from **/admin → Users**.

### 7. Deploy and verify
- Trigger a deploy (push to the connected branch, or `vercel --prod`).
- Open the deployment URL → `/signin` → sign in with the admin → editor loads; `/admin` loads.
- Smoke: create + save a proposal (DB), Regenerate a section (Anthropic), upload a logo (Blob), export a PDF.

---

## Local development against the same Neon (recommended once Vercel is set up)
Instead of hand-creating a local DB, pull the project's env from Vercel:
```
npm i -g vercel
vercel link            # pick the ricardo-phoenixenergy/proposal-builder project (run from repo root)
cd apps/web && vercel env pull .env.local   # writes ALL project env vars into apps/web/.env.local
```
Two caveats:
1. **`vercel env pull` OVERWRITES `apps/web/.env.local`.** Add `ANTHROPIC_API_KEY` (and `AUTH_SECRET`) to Vercel **before** pulling, or they won't be in the pulled file. Back the file up first if unsure.
2. **This points local at the production Neon by default.** To avoid writing prod data while developing, create a **Neon dev branch** (Neon dashboard → Branches) and use its connection string for local (`DATABASE_URL` in `apps/web/.env.local`) instead of the pulled prod one. Migrate that branch too (Step 5, pointed at the branch URL).

After pulling/setting env: run migrations + create an admin against whichever DB local points at (Steps 5–6), then `npm run dev`. See `2026-06-21-local-testing.md` for the local smoke tests + troubleshooting.

---

## PDF export on Vercel
- The export route is `runtime = "nodejs"`, `maxDuration = 60`; Chromium is fetched from the pack URL at cold start.
- **If export OOMs or times out:** raise the function memory. Add `apps/web/vercel.json`:
  ```json
  {
    "functions": {
      "app/api/proposals/[id]/export/route.ts": { "memory": 1024, "maxDuration": 60 }
    }
  }
  ```
  (Bump memory up to 3008 MB if needed, or set it in Project Settings → Functions.)
- For pack-download reliability, optionally host the tar yourself (e.g. in Vercel Blob) and set `CHROMIUM_PACK_URL` to it.
- `/print/[id]` renders without a session via a short-lived signed render token that the export route mints — no extra config.

## Gotchas
- **`DATABASE_URL`, `AUTH_SECRET`, `ANTHROPIC_API_KEY` must all be set** before sign-in/generation work; redeploy after adding env vars (they apply on the next build).
- **Preview deployments:** link Neon + the env vars to **Preview** too, or sign-in/persistence won't work on PR previews.
- **`AUTH_SECRET` rotation** invalidates all existing sessions.
- Custom domain behind a non-Vercel proxy that causes host errors → set `AUTH_URL` (and `AUTH_TRUST_HOST=true`) explicitly. Not needed on default `*.vercel.app`.
- Re-run **step 5 (migrate)** whenever you add a new migration; deploys don't migrate automatically.

## Done when
- [ ] build is green on Vercel
- [ ] `DATABASE_URL` + `AUTH_SECRET` + `ANTHROPIC_API_KEY` (+ `BLOB_READ_WRITE_TOKEN` if used) set for Production
- [ ] migrations applied to the production DB
- [ ] admin account created on production
- [ ] sign-in works on the deployed URL
- [ ] PDF export works (or function memory tuned)
