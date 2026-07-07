# Open Questions

Living list of unresolved design decisions. When one is settled, move it to **Decided** below with a one-line rationale and update the doc that owns it.

## Architecture

- **API shape**: plain REST vs. something else. Leaning REST + OpenAPI since "any agent that can call an HTTP API" is a design principle.
- **Auth model**: how human vs. agent credentials are issued and distinguished. The state machine's permission rules depend on the API deriving actor type from the credential, never from the request body.
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

- Label schema (priority + category/project) — not yet specified.
- Annotation/suggestion format — structured fields vs. freeform markdown with conventions.
- Event store shape: current state as a projection of append-only events is the stated design; how literally to event-source v1 is open.

## Decided

- **Stack: TypeScript + Node (≥20) + Fastify, SQLite for storage** *(2026-07-06)* — one language across API and eventual UI, runs comfortably on a Raspberry Pi, easiest surface for agents to contribute to. API-only skeleton first; UI layout deferred.
