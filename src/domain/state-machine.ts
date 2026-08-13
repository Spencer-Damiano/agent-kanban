/**
 * The card state machine: states, actors, and — the core contract — who may
 * trigger each transition. Pure functions, no I/O. The API layer enforces
 * these decisions and must fail closed (403) on `allowed: false`, never
 * coerce a request into an allowed transition.
 *
 * Source of truth: docs/state-machine.md. Keep the two in sync.
 */

export const CARD_STATES = [
  "inbox",
  "backlog",
  "ready",
  "in_progress",
  "manual_review",
  "done",
  "blocked",
  "waiting",
  "cancelled",
] as const;

export type CardState = (typeof CARD_STATES)[number];

export type ActorType = "human" | "agent" | "system";

export const EXECUTORS = ["human", "agent", "unassigned"] as const;
export type ExecutorType = (typeof EXECUTORS)[number];

export const REVIEW_POLICIES = ["reviewed", "auto"] as const;
export type ReviewPolicy = (typeof REVIEW_POLICIES)[number];

export const CATEGORIES = ["professional", "community", "personal"] as const;
export type Category = (typeof CATEGORIES)[number];

export const PENDING_TIERS = ["daydream", "white-whale"] as const;
export type PendingTier = (typeof PENDING_TIERS)[number];

export interface Labels {
  category: Category | null;
  focus: boolean;
  pendingTier: PendingTier | null;
}

export interface Actor {
  type: ActorType;
}

/** The slice of a card that transition permissions depend on. */
export interface TransitionCard {
  state: CardState;
  executor: ExecutorType;
  reviewPolicy: ReviewPolicy;
  /** For blocked/waiting cards: the state the card was paused from. */
  pausedFrom?: CardState;
}

/**
 * `noteRequired` marks transitions that must carry a note: an agent entering
 * manual_review (summary + suggested next steps) or blocked (what is needed),
 * an agent auto-closing (completion summary), and every review outcome
 * (approval/rejection reason).
 */
export type TransitionDecision =
  | { allowed: true; noteRequired: boolean }
  | { allowed: false; reason: string };

const TERMINAL_STATES: readonly CardState[] = ["done", "cancelled"];
const PAUSABLE_STATES: readonly CardState[] = ["ready", "in_progress"];

export function isTerminal(state: CardState): boolean {
  return TERMINAL_STATES.includes(state);
}

function allow(noteRequired = false): TransitionDecision {
  return { allowed: true, noteRequired };
}

function deny(reason: string): TransitionDecision {
  return { allowed: false, reason };
}

/** An actor executes a card when the card is assigned to its actor type. */
function isExecutor(card: TransitionCard, actor: Actor): boolean {
  return actor.type !== "system" && card.executor === actor.type;
}

/** Card creation (into inbox): human capture or agent-proposed work. */
export function canCreateCard(actor: Actor): boolean {
  return actor.type === "human" || actor.type === "agent";
}

/**
 * Assigning or reassigning the executor — offloading a card or taking it
 * back — is the human's act, always. An agent may volunteer via annotation
 * but never assign work to itself or shed work it was given.
 */
export function canChangeExecutor(actor: Actor): boolean {
  return actor.type === "human";
}

/**
 * Only a human grants or revokes the `auto` review policy. Marking a task
 * `auto` is the review, amortized. (An agent tightening supervision on an
 * auto card goes through escalation — in_progress → manual_review — not a
 * policy change.)
 */
export function canChangeReviewPolicy(actor: Actor): boolean {
  return actor.type === "human";
}

/**
 * Editing a card's definition (title/description) is human-only: the
 * definition is what the human triages and reviews — and, for an `auto`
 * card, what the grant covers — so an agent must not be able to rewrite it.
 * An agent proposes edits via annotation.
 */
export function canEditCard(actor: Actor): boolean {
  return actor.type === "human";
}

/** Label changes (category, focus, pending-tier) are the human's planning act. */
export function canChangeLabels(actor: Actor): boolean {
  return actor.type === "human";
}

export function canTransition(
  card: TransitionCard,
  to: CardState,
  actor: Actor,
): TransitionDecision {
  const from = card.state;

  if (isTerminal(from)) return deny(`${from} is terminal; no transitions out`);
  if (from === to) return deny(`card is already ${to}`);

  // Any non-terminal state → cancelled: withdrawing a card is human-only.
  if (to === "cancelled") {
    return actor.type === "human" ? allow() : deny("only a human may cancel a card");
  }

  // Pausing: ready / in_progress → blocked or waiting.
  if (to === "blocked" || to === "waiting") {
    if (!PAUSABLE_STATES.includes(from)) return deny(`cannot pause a card from ${from}`);
    const permitted =
      isExecutor(card, actor) ||
      actor.type === "human" ||
      (to === "waiting" && actor.type === "system");
    if (!permitted) return deny(`${actor.type} may not move this card to ${to}`);
    // An agent flagging a blocker must say what is needed to unblock.
    return allow(to === "blocked" && actor.type === "agent");
  }

  // Resuming: a paused card returns only to the state it was paused from.
  if (from === "blocked" || from === "waiting") {
    if (card.pausedFrom === undefined) return deny("card has no recorded state to resume to");
    if (to !== card.pausedFrom) {
      return deny(`a ${from} card resumes to ${card.pausedFrom}, not ${to}`);
    }
    const permitted =
      isExecutor(card, actor) ||
      actor.type === "human" ||
      (from === "waiting" && actor.type === "system");
    return permitted ? allow() : deny(`${actor.type} may not resume this card`);
  }

  switch (from) {
    case "inbox":
      // Triage — accepting a card and assigning its executor — is the
      // human's planning space.
      if (to === "backlog") {
        return actor.type === "human" ? allow() : deny("triage is human-only");
      }
      break;

    case "backlog":
      if (to === "ready") {
        return actor.type === "human" ? allow() : deny("scheduling is human-only");
      }
      break;

    case "ready":
      if (to === "in_progress") {
        return isExecutor(card, actor)
          ? allow()
          : deny("only the card's executor may pick it up");
      }
      break;

    case "in_progress":
      if (to === "manual_review") {
        // Finished reviewed work, or an auto card escalating — asking for
        // review only tightens supervision, so it is always open to the
        // executing agent.
        if (card.executor !== "agent") {
          return deny("manual review is for agent-executed cards only");
        }
        return isExecutor(card, actor)
          ? allow(true)
          : deny("only the executing agent submits work for review");
      }
      if (to === "done") {
        if (card.executor === "human") {
          return isExecutor(card, actor)
            ? allow()
            : deny("only the human closes their own work");
        }
        if (card.executor === "agent") {
          if (!isExecutor(card, actor)) {
            return deny("delegated work is closed through manual review");
          }
          return card.reviewPolicy === "auto"
            ? allow(true)
            : deny("a reviewed card must go through manual review");
        }
        return deny("an unassigned card cannot be completed");
      }
      break;

    case "manual_review":
      // The review outcome — approve, send back for rework, or re-scope —
      // is the human's call, and always carries a reason.
      if (to === "done" || to === "in_progress" || to === "backlog") {
        return actor.type === "human" ? allow(true) : deny("review outcomes are human-only");
      }
      break;
  }

  return deny(`no transition from ${from} to ${to}`);
}
