import { describe, expect, it } from "vitest";
import {
  CARD_STATES,
  canChangeExecutor,
  canChangeReviewPolicy,
  canCreateCard,
  canTransition,
  isTerminal,
  type Actor,
  type CardState,
  type TransitionCard,
} from "../src/domain/state-machine.js";

const human: Actor = { type: "human" };
const agent: Actor = { type: "agent" };
const system: Actor = { type: "system" };

function card(state: CardState, overrides: Partial<TransitionCard> = {}): TransitionCard {
  return { state, executor: "unassigned", reviewPolicy: "reviewed", ...overrides };
}

function expectAllowed(
  c: TransitionCard,
  to: CardState,
  actor: Actor,
  noteRequired = false,
): void {
  expect(canTransition(c, to, actor)).toEqual({ allowed: true, noteRequired });
}

function expectDenied(c: TransitionCard, to: CardState, actor: Actor): void {
  const decision = canTransition(c, to, actor);
  expect(decision.allowed).toBe(false);
}

describe("creation and governance", () => {
  it("humans and agents may create cards; the system may not", () => {
    expect(canCreateCard(human)).toBe(true);
    expect(canCreateCard(agent)).toBe(true);
    expect(canCreateCard(system)).toBe(false);
  });

  it("executor changes are human-only", () => {
    expect(canChangeExecutor(human)).toBe(true);
    expect(canChangeExecutor(agent)).toBe(false);
    expect(canChangeExecutor(system)).toBe(false);
  });

  it("review-policy changes are human-only", () => {
    expect(canChangeReviewPolicy(human)).toBe(true);
    expect(canChangeReviewPolicy(agent)).toBe(false);
    expect(canChangeReviewPolicy(system)).toBe(false);
  });
});

describe("triage and scheduling (human-only planning space)", () => {
  it.each([
    ["inbox", "backlog"],
    ["backlog", "ready"],
  ] as const)("%s → %s: human yes, agent and system no", (from, to) => {
    expectAllowed(card(from, { executor: "agent" }), to, human);
    expectDenied(card(from, { executor: "agent" }), to, agent);
    expectDenied(card(from, { executor: "agent" }), to, system);
  });
});

describe("ready → in_progress (executor picks up)", () => {
  it("the executor may pick the card up", () => {
    expectAllowed(card("ready", { executor: "human" }), "in_progress", human);
    expectAllowed(card("ready", { executor: "agent" }), "in_progress", agent);
  });

  it("non-executors may not — not even the human on an agent card", () => {
    expectDenied(card("ready", { executor: "agent" }), "in_progress", human);
    expectDenied(card("ready", { executor: "human" }), "in_progress", agent);
    expectDenied(card("ready", { executor: "unassigned" }), "in_progress", human);
    expectDenied(card("ready", { executor: "unassigned" }), "in_progress", agent);
    expectDenied(card("ready", { executor: "agent" }), "in_progress", system);
  });
});

describe("completing work", () => {
  it("the human closes their own work directly, no review gate", () => {
    expectAllowed(card("in_progress", { executor: "human" }), "done", human);
  });

  it("an agent never closes human-executed work", () => {
    expectDenied(card("in_progress", { executor: "human" }), "done", agent);
  });

  it("a reviewed agent card gates through manual review (note required)", () => {
    const c = card("in_progress", { executor: "agent", reviewPolicy: "reviewed" });
    expectAllowed(c, "manual_review", agent, true);
    expectDenied(c, "done", agent); // may not skip the gate
    expectDenied(c, "done", human); // human closes it via review, not directly
  });

  it("an auto agent card closes directly (summary still required)", () => {
    const c = card("in_progress", { executor: "agent", reviewPolicy: "auto" });
    expectAllowed(c, "done", agent, true);
  });

  it("an auto card may always escalate into manual review", () => {
    const c = card("in_progress", { executor: "agent", reviewPolicy: "auto" });
    expectAllowed(c, "manual_review", agent, true);
  });

  it("manual review is for agent-executed cards only", () => {
    expectDenied(card("in_progress", { executor: "human" }), "manual_review", human);
    expectDenied(card("in_progress", { executor: "human" }), "manual_review", agent);
  });

  it("a human may not push an agent's card into review", () => {
    expectDenied(card("in_progress", { executor: "agent" }), "manual_review", human);
  });
});

describe("manual review outcomes (human-only, reason required)", () => {
  it.each([
    ["done"], // approve
    ["in_progress"], // rework
    ["backlog"], // re-scope
  ] as const)("manual_review → %s: human yes with note, agent no", (to) => {
    const c = card("manual_review", { executor: "agent" });
    expectAllowed(c, to, human, true);
    expectDenied(c, to, agent);
    expectDenied(c, to, system);
  });
});

describe("pausing (blocked / waiting)", () => {
  it("the executor or the human may block a card", () => {
    expectAllowed(card("ready", { executor: "human" }), "blocked", human);
    expectAllowed(card("in_progress", { executor: "agent" }), "blocked", human);
    expectAllowed(card("in_progress", { executor: "human" }), "blocked", human);
  });

  it("an agent blocking its own card must note what is needed", () => {
    expectAllowed(card("in_progress", { executor: "agent" }), "blocked", agent, true);
  });

  it("an agent may not pause someone else's card", () => {
    expectDenied(card("in_progress", { executor: "human" }), "blocked", agent);
    expectDenied(card("in_progress", { executor: "human" }), "waiting", agent);
  });

  it("the system may park a card in waiting but not blocked", () => {
    expectAllowed(card("in_progress", { executor: "agent" }), "waiting", system);
    expectDenied(card("in_progress", { executor: "agent" }), "blocked", system);
  });

  it.each([["inbox"], ["backlog"], ["manual_review"]] as const)(
    "cards cannot pause from %s",
    (from) => {
      expectDenied(card(from, { executor: "agent" }), "blocked", human);
      expectDenied(card(from, { executor: "agent" }), "waiting", human);
    },
  );
});

describe("resuming", () => {
  it("a paused card resumes only to the state it was paused from", () => {
    const blocked = card("blocked", { executor: "agent", pausedFrom: "in_progress" });
    expectAllowed(blocked, "in_progress", agent);
    expectAllowed(blocked, "in_progress", human);
    expectDenied(blocked, "ready", agent);
    expectDenied(blocked, "ready", human);
  });

  it("a card with no recorded pausedFrom cannot resume", () => {
    expectDenied(card("blocked", { executor: "agent" }), "in_progress", human);
  });

  it("the system may resume waiting cards but not blocked ones", () => {
    expectAllowed(card("waiting", { executor: "agent", pausedFrom: "ready" }), "ready", system);
    expectDenied(card("blocked", { executor: "agent", pausedFrom: "ready" }), "ready", system);
  });

  it("an agent may not resume someone else's card", () => {
    expectDenied(card("blocked", { executor: "human", pausedFrom: "in_progress" }), "in_progress", agent);
  });
});

describe("cancellation", () => {
  const nonTerminal = CARD_STATES.filter((s) => !isTerminal(s));

  it.each(nonTerminal.map((s) => [s]))("%s → cancelled: human only", (from) => {
    expectAllowed(card(from, { executor: "agent" }), "cancelled", human);
    expectDenied(card(from, { executor: "agent" }), "cancelled", agent);
    expectDenied(card(from, { executor: "agent" }), "cancelled", system);
  });
});

describe("terminal states are terminal", () => {
  const actors = [human, agent, system];

  it.each([["done"], ["cancelled"]] as const)("nothing leaves %s", (from) => {
    for (const to of CARD_STATES) {
      for (const actor of actors) {
        expectDenied(card(from, { executor: "agent" }), to, actor);
      }
    }
  });
});

describe("no-ops and unknown transitions", () => {
  it("a transition to the current state is denied", () => {
    expectDenied(card("ready", { executor: "human" }), "ready", human);
  });

  it("transitions not in the table are denied even for humans", () => {
    expectDenied(card("inbox"), "ready", human); // must triage first
    expectDenied(card("inbox"), "done", human);
    expectDenied(card("backlog"), "in_progress", human); // must be marked ready
    expectDenied(card("done"), "in_progress", human); // no reopening
    expectDenied(card("ready"), "inbox", human); // nothing returns to inbox
  });
});
