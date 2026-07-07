# Roadmap

Working queue and build order. Keep one item **In progress** at a time; move finished items to **Done** with the date. This file — plus `CLAUDE.md` and the design docs — is everything a fresh session needs to pick up where the last one left off, so keep it current and conversation context can be cleared freely.

(Yes, this file is a kanban board for building a kanban board. Once the API works, dogfooding it is the plan.)

## In progress

*(nothing)*

## Next

**Reassess** — an agent can now drive the board via `curl` with an agent token: run the first end-to-end validation of the design (dogfood this roadmap onto the board), then pick the next item from Later.

## Later

- Decomposition (parent/child cards)
- "What needs my attention" view/filter
- Realtime updates (polling vs. push — open question)
- Web UI
- Recurrence / template cards

## Done

- Auth — static bearer tokens bound to actor type (`src/routes/actor.ts`): `HUMAN_TOKENS`/`AGENT_TOKENS` env vars (`id:token` pairs), actor derived from the token never the body, all `/cards` routes require a token (reads included), server refuses to start without credentials; OpenAPI carries the bearer scheme; tests in `tests/actor.test.ts` + updated `tests/api.test.ts` *(2026-07-06)*
- API routes — REST surface over `CardStore` (`src/routes/`): cards create/list/get/edit, action endpoints for transition/executor/review-policy/annotations, per-card audit trail; typed store errors mapped to 401/403/404/400, fails closed; OpenAPI spec generated from route schemas via `@fastify/swagger`, served at `/openapi.json`; interim `x-actor-*` header credentials isolated in `src/routes/actor.ts` for item 4 to replace; API-shape decision recorded in `open-questions.md`; 17 tests in `tests/api.test.ts` *(2026-07-06)*
- Persistence — SQLite via better-sqlite3 (`src/persistence/`): append-only `events` table as source of truth + materialized `cards` projection updated in the same transaction; `CardStore` enforces the domain core itself with typed errors (`PermissionError`→403, `NotFoundError`→404, `ValidationError`→400) so routes just map them; `rebuildProjection()` replays events to reconstruct `cards`; 16 tests in `tests/card-store.test.ts` *(2026-07-06)*
- Domain core — `src/domain/state-machine.ts`: state/actor/executor/review-policy types, `canTransition()` + creation/executor/review-policy permission checks mirroring `docs/state-machine.md`; `noteRequired` flags transitions that must carry a note; 40 table-driven tests in `tests/state-machine.test.ts` *(2026-07-06)*
- Project scaffold — TypeScript + Fastify skeleton, `/health` endpoint + test, docs housekeeping (root `CLAUDE.md`, `open-questions.md`, README) *(2026-07-06)*
