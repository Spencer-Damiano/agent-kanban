# Productivity Purge

Status: decided direction, not yet implemented. This layers Cal Newport's "Einstein Principle" / [Productivity Purge](https://calnewport.com/the-einstein-principle-accomplish-more-by-doing-less/) methodology onto the board as the human's personal-planning philosophy. It rides entirely on labels and recurring cards — **no state-machine changes**. The two-track model (`docs/state-machine.md`) stays exactly as designed; this doc governs how the human's own lane gets organized and how the agent assists in purging it.

## Why this exists

The board already answers "what should I look at?" (`state-machine.md`, "What needs my attention"). This doc answers the complementary question the Einstein Principle is about: "what should I be working on at all?" — real accomplishment requires ruthless constraint on the number of active projects, not just good tracking of the ones you have.

## Label schema

Three independent facets, all plain labels — no new card fields, no state-machine involvement:

- **`category`**: `professional` | `community` | `personal`. Replaces the 2007 article's professional/extracurricular/personal split — broader than "second job."
- **`focus`**: a starred flag. Human norm: 1–2 starred cards per category at a time — these are the only cards that should be getting deep, sustained attention. **Not API-enforced**; the weekly/quarterly rituals below are what keep the count honest.
- **`pending-tier`**: meaningful only on non-`focus` cards sitting in `Backlog` (which already means "accepted, not yet actionable" — Newport's "parking lot" is just that, so no separate Pending state is needed). Two values:
  - `daydream` — appealing, but doesn't feel obsessive. Cheap to keep, cheap to cross out.
  - `white-whale` — something the human would happily sink 1–3 months into, deferred purely by capacity, not desire. First candidate for the next open `focus` slot.

Promoting a white-whale to starred, or crossing out a daydream, is just a label change — already a full audit event under the existing event-sourced model, so the history of "what I chose to focus on and when" comes for free.

## Autopilot scheduling

Ongoing, non-project effort (recurring admin, standing meetings, habitual upkeep) shouldn't compete with starred focus time or clutter the purge. This is built on **recurring/template cards** — see the open recurrence question in `docs/state-machine.md` and the roadmap. A recurring card is plumbing, not a project: it never carries `focus`.

## Rituals

Two recurring, agent-executed cards. The agent's "work" on both is read-only analysis of the board plus an annotation with suggestions — it never transitions or edits cards, same annotate-not-transition rule as everywhere else. Output lands in `Manual Review`; the human runs the actual session and does the purging.

- **Weekly accountability** — the agent reads the event log for currently-starred cards since the last check-in and posts a progress summary + suggested next steps.
- **Quarterly planning/purge** — a full sweep: per category, which starred cards to keep vs. swap out; which `daydream`/`white-whale` cards have gone stale (cross-out or crunch-plan candidates); which white-whales are ready to be starred now that a slot is open. This is the agent doing the busywork of Newport's "categorize and filter" steps so the human's session is a decision meeting, not a data-gathering one.

## Open questions

- Newport's post-purge ritual — "go at least a month without starting new projects" — enforcement or just a norm the quarterly ritual reinforces? No board mechanism proposed yet.
- Does the `focus` cap (1–2 per category) ever get soft-enforced (e.g. a warning annotation when a third card is starred), or stay purely a human norm?
