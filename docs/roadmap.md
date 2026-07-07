# Roadmap

Working queue and build order. Keep one item **In progress** at a time; move finished items to **Done** with the date. This file — plus `CLAUDE.md` and the design docs — is everything a fresh session needs to pick up where the last one left off, so keep it current and conversation context can be cleared freely.

(Yes, this file is a kanban board for building a kanban board. Once the API works, dogfooding it is the plan.)

## In progress

*(nothing — next up: persistence)*

## Next

2. **Persistence** — SQLite. Append-only `events` table as the source of truth, plus a materialized `cards` table updated in the same transaction for cheap reads.
3. **API routes** — cards CRUD, a transition endpoint that consults the domain core and fails closed (403), annotations. Settle REST + OpenAPI here and record it in `open-questions.md`.
4. **Auth** — two credential types (human vs. agent tokens); actor type derived from the credential, never the request body. Static tokens in config are fine for v1.

**Reassess after 4** — at that point an agent can drive the board via `curl`, the first end-to-end validation of the design.

## Later

- Decomposition (parent/child cards)
- "What needs my attention" view/filter
- Realtime updates (polling vs. push — open question)
- Web UI
- Recurrence / template cards

## Done

- Domain core — `src/domain/state-machine.ts`: state/actor/executor/review-policy types, `canTransition()` + creation/executor/review-policy permission checks mirroring `docs/state-machine.md`; `noteRequired` flags transitions that must carry a note; 40 table-driven tests in `tests/state-machine.test.ts` *(2026-07-06)*
- Project scaffold — TypeScript + Fastify skeleton, `/health` endpoint + test, docs housekeeping (root `CLAUDE.md`, `open-questions.md`, README) *(2026-07-06)*
