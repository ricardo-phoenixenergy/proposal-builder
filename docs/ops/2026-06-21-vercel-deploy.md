# Vercel Deployment Runbook

**Goal:** deploy the app to Vercel with Postgres (Neon), auth, AI generation, blob uploads, and PDF export working.

**Architecture notes that shape the setup:**
- **Monorepo** (npm workspaces). The deployable is `apps/web` (Next.js 15 App Router). It transpiles `@proposal/shared` (raw TS) via `transpilePackages` — no prebuild step needed.
- **DB:** Neon, added through the Vercel Marketplace (auto-injects `DATABASE_URL`). Required in production for sign-in, persistence, and export (in-memory won't do).
- **Auth:** next-auth v5, JWT sessions. Needs `AUTH_SECRET`; it trusts the Vercel host automatically (detects the `VERCEL` env).
- **PDF export:** the export route runs on the Node runtime and, on Vercel, launches `puppeteer-core` + `@sparticuz/chromium-min`, fetching a Chromium "pack" tar at cold start. Works out of the box; may need extra function memory.

**Decision (made):** provision the database via the **Neon Vercel Marketplace integration**.

---

## Steps

### 0. Put the repo under version control (it isn't a git repo yet)
Secrets are safe — `.gitignore` already ignores `.env*.local`.
```
git init
git add -A
git commit -m "Proposal builder"
```
Then create a GitHub repo and push (recommended — gives Vercel CI + preview deploys).
**Alternative without GitHub:** `npm i -g vercel`, then `vercel` from the repo root to link + deploy, `vercel --prod` for production. (You still do the env + DB + migrate + admin steps below.)

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
