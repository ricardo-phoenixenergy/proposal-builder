# Proposal Generator — Project Brief

This file is loaded at the start of every session. It is the lean, always-on brief.
The full *what and why* lives in `docs/specs/proposal-generator-spec.md` (v3.0) —
read it for any architectural question. Do not duplicate the spec here.

---

## What this is

A web app that generates brand-aligned client proposals: the Claude API drafts
structured copy, users edit it live in a React-rendered document, and proposals export
to print-quality PDF via headless Chromium. The defining principle is a strict
three-layer separation (see Non-negotiables).

## Build discipline

- Build in the **sliced sequence in §13 of the spec, one slice at a time.**
  Stop at each slice's validation point and wait for review. **Do not build ahead.**
- **Before writing code for a slice**, propose: folder/file changes, any new
  dependencies (with reasons), and how you'll handle open judgement calls. Wait for go-ahead.
- Slice 1 is the schema/type foundation (§14) plus a sample `ProposalDocument` that
  passes validation, ideally as a real test. Start there.
- Treat the spec as a strong default you may question — flag anything ambiguous or
  worth pushing back on rather than guessing.

## Stack (honour this; ask before deviating)

- **React + TypeScript + Next.js (App Router), deployed on Vercel.**
  > Deviation from spec §3 (which prescribed Vite + a separate Node/Fastify tier),
  > authorised 2026-06-17. The spec's three-*tier* deployment is replaced by Vercel-native
  > functions; the three-*layer* content/structure/presentation invariant is unchanged.
  > The editor is a client shell (`app/page.tsx` → `src/App`); the print route stays RSC.
- State: Zustand — single source of truth for proposal JSON + theme + template
- Validation: Ajv against JSON Schema
- Editor: Monaco (live theme/template JSON editing)
- Charts: Recharts/Visx/Chart.js, wrapped in token-aware components
- Backend: **Vercel Route Handlers** (Claude proxy, schema validation, data import);
  **Vercel Postgres (Neon, JSONB) + Vercel Blob** for persistence and assets
- PDF: headless Chromium rendering the same React components via the `/print/:id` route
  (serverless Chromium on Vercel is the slice-9 unknown — see spec §15)
- Monorepo: npm workspaces. `packages/shared` is framework-agnostic (types/schema/validation,
  imported by both the app and Route Handlers); `apps/web` is the Next app.
- Module imports are **extensionless** (tsconfig `moduleResolution: "bundler"`); do not add `.js`.
- **Do not add dependencies, frameworks, CSS systems, or boilerplate without asking.**

## Non-negotiables (architectural invariants)

- **Three-layer split.** Content (structured JSON) / Structure (templates as ordered
  section slots) / Presentation (React components + theme tokens). Never blur these.
- **The AI generates schema-conformant CONTENT only** — never layout, styling, HTML,
  CSS, or React. Reject any styling/markup that appears in content data.
- **Schemas attach to section TYPES, not individual slides**, and are reused across
  templates. Templates reference types via slots and may carry thin per-template overrides.
- **Theme = CSS variables.** Components never hardcode colours/fonts; they read tokens.
  Re-theming must require no content re-render.
- **Variants are developer-authored, registered layouts.** Users pick from them; they
  never author layout. The live code editor edits **theme/template JSON only, never JSX**
  (running user-authored components is forbidden).
- **Every section must render**: if no component is registered for a type, the generic
  fallback renders it (flagged unstyled). Components degrade gracefully on schema drift.
- **Limits enforced at three points**: generation (constrain the model), edit (live
  meters), and export (hard gate). Text limits = words/chars; data limits = rows/cols/series.
- **§14 holds the canonical types** (ProposalDocument, SectionTypeSchema, Dataset,
  ComparisonMatrix, Template/Slot). Treat them as the single source of truth.

## API & data notes

- Claude API key is **server-side only**; the browser calls the backend proxy, never Anthropic directly.
- Use the Messages API with Structured Outputs; **verify the current API surface against
  Anthropic's docs before building generation (slice 6)** — do not trust a snapshot.
- Per-section regeneration replaces only that section's `data`; **never clobber other
  sections or manual edits.**

## Commands

<!-- Fill in once scaffolded; run /init to let Claude Code discover and populate these. -->
- Install: `TBD`
- Dev: `TBD`
- Build: `TBD`
- Test: `TBD`
- Lint/format: `TBD`

## Conventions

- TypeScript strict mode.
- Shared types/schema live in one place, imported by both frontend and backend.
- Keep section components pure: `(data, theme) → JSX`, no data fetching inside.