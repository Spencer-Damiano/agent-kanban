# Open Questions

Living list of unresolved design decisions. When one is settled, move it to **Decided** below with a one-line rationale and update the doc that owns it.

## Architecture
- **Realtime updates**: polling vs. push (SSE/WebSocket) for board changes.
- **UI approach**: server-rendered, SPA, or something minimal; not started.
- **Project name**: `agent-kanban` is a working title.

## State machine (owned by `state-machine.md`)

- Is human-only triage (`Inbox → Backlog`) and scheduling (`Backlog → Ready`) too much friction? Alternative: an agent may triage cards *it created* into Backlog with executor pre-set to itself, subject to a human veto window.
- Does "human-only" mean human *credential* or human *intent* when the human works through an agent session? Drafted as credential.
- Does a parent card auto-advance when all children are terminal, or just surface as "reviewable"?
- Is the `Blocked` vs `Waiting` split worth the state count, or should they collapse into one paused state with a reason field?
- Recurrence for repeatable delegated tasks: System clones a template card on a schedule? (Leading candidate; templates are also the natural place to hang an `auto` grant.)
- What guardrails accompany `auto` beyond the audit trail — side-effect budget, spot-check digest, auto-demotion after N failures?
- Is there a path back out of `Done` (reopening)? Drafted as a true terminal state.
- Can an agent cancel a card it executes when the task is obsolete, or is `Cancelled` strictly human-only as drafted?

## Data model

- Annotation/suggestion format — structured fields vs. freeform markdown with conventions. (Persisted for now as freeform `annotation_added` events; a structured format would layer on top.)

## Product philosophy (owned by `productivity-purge.md`)

- Enforcement (if any) of Newport's "no new projects for a month" post-purge ritual.
- Does the `focus` cap (1–2 starred cards per category) ever get soft-enforced, or stay a human norm the rituals reinforce?

## Decided

- **Label schema: three facets — `category`, `focus`, `pending-tier`** *(2026-08-13)* — `category`: `professional` | `community` | `personal` (replaces the earlier professional/extracurricular/personal split). `focus`: starred flag, human norm of 1–2 per category, not API-enforced. `pending-tier` (meaningful on non-`focus` `Backlog` cards): `daydream` (appealing, not obsessive, cheap to drop) | `white-whale` (would commit 1–3 months to, deferred by capacity not desire — first candidate for the next open `focus` slot). Newport's "pending" parking lot maps onto the existing `Backlog` state as-is — no new state needed. Full rationale in `docs/productivity-purge.md`.
- **Auth: static bearer tokens bound to an actor type** *(2026-07-06)* — `HUMAN_TOKENS` / `AGENT_TOKENS` env vars hold comma-separated `id:token` pairs; each request's actor id and type come from its `Authorization: Bearer` token (`src/routes/actor.ts`), never from the request body, per the state machine's contract. Every `/cards` route — reads included, the board is personal data — requires a token; `/health` and `/openapi.json` stay open. The server refuses to start with zero credentials or duplicate tokens (fail closed, never a quietly unusable board). Rotation is edit-config-and-restart; issuance, scopes, and expiring per-agent tokens are deferred until after the end-to-end validation.
- **API shape: REST + OpenAPI** *(2026-07-06)* — resource routes for the card (`POST/GET /cards`, `GET/PATCH /cards/:id`) plus action sub-routes for the audited acts (`POST /cards/:id/transition|executor|review-policy|annotations`, `GET /cards/:id/events`), because transitions and executor changes are permission-checked events, not field updates — a generic `PATCH state` would invite coercion, the action routes fail closed. Spec is generated from the Fastify route schemas via `@fastify/swagger` and served at `/openapi.json`, so validation and the published contract cannot drift. Card definition edits (`PATCH /cards/:id`, title/description) are human-only: the definition is what the human triages/reviews and what an `auto` grant covers; agents propose edits via annotation. No `DELETE` — withdrawal is the `cancelled` transition, keeping the audit trail append-only.
- **Event store shape: append-only `events` table as source of truth, materialized `cards` projection in the same transaction** *(2026-07-06)* — event-sourced enough for the audit-trail principle (state is provably a projection; `rebuildProjection()` replays the log) without full ES machinery like versioned aggregates or async projections. Driver: better-sqlite3 — synchronous fits one-transaction-per-operation, prebuilt ARM binaries for the Pi, keeps Node ≥20 (built-in `node:sqlite` would force ≥23).
- **Stack: TypeScript + Node (≥20) + Fastify, SQLite for storage** *(2026-07-06)* — one language across API and eventual UI, runs comfortably on a Raspberry Pi, easiest surface for agents to contribute to. API-only skeleton first; UI layout deferred.
