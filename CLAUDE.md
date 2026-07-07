# CLAUDE.md

## What this project is

A self-hosted kanban board **shared by one human and their AI agent(s)** — one board that both read and write, so they stay on the same page. It does three jobs at once:

1. **Handoff queue.** The human hands selected tasks to an agent, then checks the agent's progress and its suggested next steps.
2. **Personal task manager.** The human plans their own complex work on the same board, breaking it down into child cards.
3. **Decision surface.** Seeing both kinds of work in one place shows the human what deserves more of their time and what should be offloaded to an agent.

This is not a Trello clone or a general project-management tool — the design center is a human and an agent coordinating through a shared board, with delegated work reviewed before it is final.

**Current phase: early scaffolding.** The API skeleton exists (TypeScript + Fastify, hello-world `/health` endpoint and test); no domain features yet. Design docs in `docs/` remain the source of truth — implement against them, and update them when a decision changes. **The build queue lives in `docs/roadmap.md`** — check it at the start of a session, and move items to Done as they finish.

## Core concepts

- **Columns are states.** Working draft: Inbox → Backlog → Ready → In Progress → Manual Review → Done, plus Blocked/Waiting and Cancelled. Formalized in `docs/state-machine.md`.
- **Every card has an executor** — the human or an agent. Handing work off ("offloading") means the human reassigns the executor. Executor changes are human-only.
- **Delegated work is reviewed by default.** Agent-executed cards end in Manual Review with a progress summary and suggested next steps; the human marks them Done. Human-executed work closes directly — the human does not gate their own work.
- **Trusted automation is the exception, granted per task by the human.** A card marked `auto` closes directly to Done but still lives on the board: every run is a card with a full audit trail, and failures surface in Blocked. An agent can never mark work auto — only escalate an auto card back into review.
- **Agents may annotate any card** (progress notes, suggestions, proposed breakdowns) **but may only transition cards they execute.** Ownership is enforced by the board via credentials, not by convention.
- **Cards decompose.** A complex card breaks into child cards; each child can be kept or offloaded independently.
- **Labels carry priority and category/project.**

## Design principles

1. **API-first.** Agents are first-class clients. Every human-visible action must be possible through the API, and the API surface is where executor and transition-ownership rules live.
2. **Review-before-done by default.** The Manual Review gate on delegated work is the point of the system. Exemptions (`auto`) are explicit human grants — the review happens up front, on the task definition — never an agent's own call.
3. **Vendor-neutral and self-hostable.** No dependency on any board SaaS. Target deployment includes modest hardware (e.g. a Raspberry Pi).
4. **Agent-framework-agnostic.** Must work with any agent that can call an HTTP API. Framework-specific adapters live outside this repo.
5. **Audit trail.** State transitions, executor changes, and approvals are events, recorded and exportable.

## Repo rules

- **This repo is intended to go public.** Never commit personal data: no real names, emails, hostnames, tokens, channel IDs, or references to any specific personal deployment. Deployment-specific config belongs in a separate private repo.
- Keep this file short. Detailed design discussion goes in `docs/`, linked from here.

## Stack

- TypeScript + Node (≥20), Fastify, SQLite planned for storage. API-only for now; UI approach is still open.
- `npm run dev` — dev server with reload; `npm test` — Vitest; `npm run typecheck` — tsc.
- Tests build the app via `buildApp()` from `src/app.ts` and use Fastify's `inject()` — no port binding in tests.

## Layout

- `src/` — API source (`app.ts` builds the Fastify app, `index.ts` is the listen entry point)
- `tests/` — Vitest tests
- `docs/` — design docs (state machine, open questions) and `roadmap.md` (build queue)
- `README.md` — project pitch and status

## Open decisions (tracked in docs/open-questions.md)

- API shape (REST vs. other) and auth model for agent vs. human clients
- Final state/column taxonomy, label schema, and annotation/suggestion format
- Realtime updates (polling vs. push) and UI approach
- Project name
