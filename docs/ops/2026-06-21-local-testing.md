# Local Testing Runbook — get sign-in (and the app) working on localhost

**Goal:** run the app locally and sign in successfully.

**Why sign-in fails today (root cause):** sign-in uses DB-backed accounts. `authenticateUser` → `getRepo().getUserByEmail`, and `getRepo()` only returns the Postgres repo when `DATABASE_URL` is set — otherwise it falls back to an **in-memory repo that has no users** (the only way to create a user is `user:create`, which writes to Postgres). So sign-in can only work once there is: a reachable Postgres, `AUTH_SECRET`, the schema migrated (a `users` table), and an admin row. A missing migration or wrong password surfaces as the same generic "Incorrect email or password." — the real cause is in the dev-server logs.

**DB choice (decided):** a free **Neon** cloud database. The runtime uses the Neon serverless HTTP driver (`drizzle-orm/neon-http`), which talks to Neon — not a plain `localhost:5432` Postgres — so Neon is the zero-code-change path and matches production exactly.

**Prerequisites:** Node 20+ and npm; a free account at https://neon.tech.

---

## Steps

### 0. Install dependencies (repo root)
```
npm install
```

### 1. Create a Neon database
- https://console.neon.tech → **New Project**.
- Copy the connection string. It looks like:
  `postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require`
- Also note the **direct (unpooled)** string (same host without `-pooler`) — a fallback for the migrate step if the pooler rejects it.

### 2. Fill `apps/web/.env.local`
This file already exists (it is gitignored — never commit it). Ensure it has these keys (add any that are missing). Do **not** paste secrets anywhere else:
```
DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require   # REQUIRED for sign-in + persistence
AUTH_SECRET=<generated>                                          # REQUIRED (signs JWT sessions)
ANTHROPIC_API_KEY=<your key>                                     # only for AI generation (likely already set)
BLOB_READ_WRITE_TOKEN=<token>                                    # only for logo/image uploads (optional locally)
```
Generate `AUTH_SECRET` (run from `apps/web/` so it writes to the right file):
- `npx auth secret`  — writes `AUTH_SECRET` into `apps/web/.env.local`, **or**
- bash: `openssl rand -base64 32`  ·  PowerShell: `[Convert]::ToBase64String((1..32 | % { Get-Random -Maximum 256 }))` — then paste it in.

### 3. Apply migrations (creates `users` + the other tables)
`drizzle-kit` does **not** auto-load `.env.local`, so pass `DATABASE_URL` in the shell for this command:
- **PowerShell:** `$env:DATABASE_URL = "postgresql://...sslmode=require"; npm run db:migrate -w @proposal/web`
- **bash:** `DATABASE_URL="postgresql://...sslmode=require" npm run db:migrate -w @proposal/web`

Expected: migrations `0000` → `0004` apply cleanly. If the **pooled** host errors here, re-run with the **direct (unpooled)** URL for this one command. (Optional check: in Neon's SQL editor, `select count(*) from users;` should return 0 without error.)

### 4. Create the first admin
`user:create` auto-loads `apps/web/.env.local`, so no shell export is needed:
```
npm run user:create -w @proposal/web -- --admin you@example.com "a-strong-password"
```
Expected: `✓ Created admin account you@example.com (user_xxxx)`. (Password ≥ 8 chars; stored scrypt-hashed.)

### 5. Run the dev server
`next dev` auto-loads `apps/web/.env.local`:
```
npm run dev
```
Open http://localhost:3000 → it redirects to `/signin`. Sign in with the admin credentials → you land on the editor. Visit `/admin` → the Builder dashboard (admin-gated).

### 6. Smoke test (optional, by feature)
| Feature | Works when |
|---|---|
| **Sign-in** (the goal) | Steps 1–4 done |
| Create / Save proposal | `DATABASE_URL` set |
| `/admin` (section types · users · templates) | signed in as admin |
| AI "Regenerate" in the Inspector | `ANTHROPIC_API_KEY` set |
| Logo / image upload | `BLOB_READ_WRITE_TOKEN` set |
| PDF export | a local Chrome — set `PUPPETEER_EXECUTABLE_PATH` to a Chrome binary, then restart dev. PowerShell example: `$env:PUPPETEER_EXECUTABLE_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"`. (Export is the serverless-Chromium path; locally it needs a real Chrome.) |

---

## Troubleshooting — sign-in still shows "Incorrect email or password."
The UI shows one generic message for every failure; **read the dev-server terminal** for the real error.
- **No `DATABASE_URL` in the dev process** → the app silently used the in-memory repo (no users). Confirm it's in `apps/web/.env.local` and restart `npm run dev`.
- **`relation "users" does not exist`** → migrations didn't run. Re-run step 3 with `DATABASE_URL` exported in the shell.
- **`DATABASE_URL is not set` from `user:create`** → it didn't load `.env.local`; run it from the repo root with `-w @proposal/web` (cwd becomes `apps/web`), or set the var inline.
- **`AUTH_SECRET` missing** → next-auth errors out; add it and restart.
- **Connection/TLS errors** → ensure the URL ends with `?sslmode=require`.
- **Right email, wrong result** → emails are stored lowercased; sign in with the same address (case-insensitive) and the exact password. Reset it later from `/admin → Users → Set password`.

## Done when
- [ ] `npm install` clean
- [ ] migrations `0000–0004` applied to the Neon DB
- [ ] admin row created (`user:create` succeeded)
- [ ] `npm run dev` running, `/signin` accepts the admin → editor loads
- [ ] `/admin` loads for the admin
