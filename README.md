# Proposal Builder

A web application that generates brand-aligned client proposals. The Claude API drafts structured copy, users edit it live in a React-rendered document, and proposals export to print-quality PDF via headless Chromium. Built on a strict three-layer separation: Content (structured JSON) / Structure (templates as ordered slots) / Presentation (React components + theme tokens).

---

## Prerequisites

- **Node.js 20** or later
- **Neon PostgreSQL** — get a `DATABASE_URL` from [neon.tech](https://neon.tech)
- **Anthropic API key** — create one at https://console.anthropic.com/settings/keys
- **Auth secret** — generate via `openssl rand -base64 32` or `npx auth secret`
- **Local Chrome/Chromium** (PDF export only) — path to binary via `PUPPETEER_EXECUTABLE_PATH` in `.env.local`, or skip for browser-only testing

### Stack

- **Frontend:** React 19, Next.js 15 (App Router), TypeScript strict, Zustand (state), Monaco (JSON editor)
- **Backend:** Vercel Route Handlers, Drizzle ORM, Neon Postgres (JSONB), Vercel Blob (assets), Auth.js v5 (auth)
- **Charts:** Recharts + Visx
- **PDF:** headless Chromium (serverless on Vercel, local via Puppeteer)
- **Monorepo:** npm workspaces (`@proposal/web` app, `@proposal/shared` types/schema)
- **Validation:** Ajv (JSON Schema)

---

## Setup

1. **Clone and install:**
   ```bash
   git clone <repo-url>
   cd proposal-builder
   npm install
   ```

2. **Configure environment** — copy the example and fill in real values:
   ```bash
   cp apps/web/.env.local.example apps/web/.env.local
   ```
   Edit `apps/web/.env.local`:
   - `DATABASE_URL` — your Neon Postgres connection string (required)
   - `AUTH_SECRET` — any 32-byte random base64 string (required)
   - `ANTHROPIC_API_KEY` — your Claude API key (required for AI features)
   - `BLOB_READ_WRITE_TOKEN` — optional, for image uploads
   - `PUPPETEER_EXECUTABLE_PATH` — optional, path to local Chrome for PDF export

3. **Run migrations** — one-time setup:
   ```bash
   # Generate schema (if needed)
   npm run db:generate -w @proposal/web
   
   # Apply migrations
   npm run db:migrate -w @proposal/web
   ```
   > **Note:** `drizzle-kit` does not auto-read `.env.local`. On Windows PowerShell:
   > ```powershell
   > $env:DATABASE_URL = "postgresql://...sslmode=require"; npm run db:migrate -w @proposal/web
   > ```

4. **Create a user account:**
   ```bash
   npm run user:create -w @proposal/web -- --admin your-email@example.com "your-password"
   ```

---

## Development

```bash
# Start dev server (Next.js hot reload)
npm run dev

# Watch mode — re-run tests on file change
npm run test:watch

# Type-check (TypeScript strict)
npm run typecheck

# Build for production
npm run build -w @proposal/web
```

### Live editing

The app exposes live JSON editors (Monaco) for:
- **Theme** — CSS token customization (colors, fonts, spacing)
- **Template** — section slot definitions + overrides

These editors live-update the React preview without page reload.

---

## Testing

```bash
# Run all tests once
npm test

# Watch mode (re-run on file change)
npm run test:watch
```

Tests are in `**/*.test.ts(x)` using Vitest.

---

## Build & Export

```bash
# Full build (frontend + backend)
npm run build -w @proposal/web

# Export as PDF (in-app)
# Click "Export" in a proposal. Requires PUPPETEER_EXECUTABLE_PATH (local)
# or runs serverless on Vercel.
```

---

## Documentation

- **Full Architecture & Spec:** [`docs/specs/proposal-generator-spec.md`](./docs/specs/proposal-generator-spec.md) — the canonical source for types, templates, validation rules, and design decisions (§1–15)
- **Audit & Roadmap:** [`AUDIT_REVIEW.md`](./AUDIT_REVIEW.md) — Phase 0 hardening, open issues, deferred work
- **Project Brief:** [`CLAUDE.md`](./CLAUDE.md) — lean, always-on project context for every session

---

## Architecture Overview

### Three-Layer Separation

1. **Content Layer** — structured JSON (proposal, sections, charts, tables)
   - Schemas attached to section *types*, reused across templates
   - AI generates content only; no layout, styling, or markup
2. **Structure Layer** — templates define ordered section slots
   - Users pick predefined template variants
   - Copy-on-write authoring for custom templates (admin only)
3. **Presentation Layer** — React components + CSS tokens
   - Components read theme tokens, never hardcoded colors/fonts
   - Fallback renderer for unknown section types (graceful degradation)

### Data Flow

```
User edit → Zustand store → React re-render
AI generation → Claude API (server proxy) → schema validation → store
Export → /print route (RSC) → headless Chromium → PDF
```

### Key Files

- `apps/web/src/app/page.tsx` — editor entry point
- `apps/web/src/app/api/generate/route.ts` — Claude proxy
- `packages/shared/src/schema.ts` — canonical JSON Schema definitions
- `packages/shared/src/types.ts` — TypeScript interfaces (ProposalDocument, Template, etc.)
- `apps/web/app/print/[id]/page.tsx` — PDF render route (RSC)

---

## Troubleshooting

**Tests fail with "Cannot use import statement outside a module"**
- Vitest may cache type mismatches. Run:
  ```bash
  npm run typecheck
  npm test
  ```

**.next EINVAL on restart**
- Delete `.next` and restart:
  ```bash
  rm -r apps/web/.next
  npm run dev
  ```

**drizzle-kit fails to load DATABASE_URL**
- Drizzle does not auto-read `.env.local`. Export it in your shell:
  ```bash
  # PowerShell
  $env:DATABASE_URL = "postgresql://..."; npm run db:migrate -w @proposal/web
  
  # Bash
  DATABASE_URL="postgresql://..." npm run db:migrate -w @proposal/web
  ```

**PDF export fails locally**
- Ensure `PUPPETEER_EXECUTABLE_PATH` points to a real Chrome/Chromium binary
- On Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`
- On macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- On Linux: `/usr/bin/chromium`

---

## Contributing

See [`CLAUDE.md`](./CLAUDE.md) for project discipline:
- Build in the sliced sequence (§13 of spec)
- Propose changes before implementing
- Maintain three-layer separation
- Use shared types from `packages/shared`

---

## License

Internal use only.
