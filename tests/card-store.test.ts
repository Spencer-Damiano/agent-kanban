import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/persistence/db.js";
import {
  CardStore,
  NotFoundError,
  PermissionError,
  ValidationError,
  rebuildProjection,
  type StoreActor,
} from "../src/persistence/card-store.js";

const human: StoreActor = { id: "human-1", type: "human" };
const agent: StoreActor = { id: "agent-1", type: "agent" };
const system: StoreActor = { id: "system", type: "system" };

let db: Db;
let store: CardStore;

beforeEach(() => {
  db = openDb(":memory:");
  store = new CardStore(db);
});

/** Create a card and walk it to the given state as its (agent) executor. */
function delegatedCard(upTo: "backlog" | "ready" | "in_progress" = "in_progress") {
  const card = store.createCard({ title: "delegated task" }, human);
  store.setExecutor(card.id, "agent", human);
  store.transitionCard(card.id, "backlog", human);
  if (upTo === "backlog") return store.getCard(card.id)!;
  store.transitionCard(card.id, "ready", human);
  if (upTo === "ready") return store.getCard(card.id)!;
  store.transitionCard(card.id, "in_progress", agent);
  return store.getCard(card.id)!;
}

describe("createCard", () => {
  it("creates an untriaged card in inbox with the default regime", () => {
    const card = store.createCard({ title: "capture", description: "details" }, human);
    expect(card).toMatchObject({
      title: "capture",
      description: "details",
      state: "inbox",
      executor: "unassigned",
      reviewPolicy: "reviewed",
      pausedFrom: null,
    });
    expect(store.getCard(card.id)).toEqual(card);
  });

  it("records a card_created event with the acting credential", () => {
    const card = store.createCard({ title: "capture" }, agent);
    const events = store.listEvents(card.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "card_created",
      actorId: "agent-1",
      actorType: "agent",
      toState: "inbox",
      payload: { title: "capture", description: "" },
    });
  });

  it("rejects system actors and empty titles", () => {
    expect(() => store.createCard({ title: "x" }, system)).toThrow(PermissionError);
    expect(() => store.createCard({ title: "   " }, human)).toThrow(ValidationError);
  });
});

describe("transitionCard", () => {
  it("walks the delegated lifecycle: triage → ready → in_progress → manual_review → done", () => {
    const card = delegatedCard();
    expect(card.state).toBe("in_progress");

    const reviewed = store.transitionCard(card.id, "manual_review", agent, "done; next: ship it");
    expect(reviewed.state).toBe("manual_review");

    const done = store.transitionCard(card.id, "done", human, "looks good");
    expect(done.state).toBe("done");
  });

  it("fails closed on a domain denial and writes nothing", () => {
    const card = store.createCard({ title: "capture" }, human);
    expect(() => store.transitionCard(card.id, "backlog", agent)).toThrow(PermissionError);
    expect(store.getCard(card.id)!.state).toBe("inbox");
    expect(store.listEvents(card.id)).toHaveLength(1); // just card_created
  });

  it("requires the note the domain flags as required", () => {
    const card = delegatedCard();
    expect(() => store.transitionCard(card.id, "manual_review", agent)).toThrow(ValidationError);
    expect(() => store.transitionCard(card.id, "manual_review", agent, "  ")).toThrow(
      ValidationError,
    );
    expect(store.getCard(card.id)!.state).toBe("in_progress");
  });

  it("lets an agent auto-close only under the auto policy, with a summary", () => {
    const card = delegatedCard();
    expect(() => store.transitionCard(card.id, "done", agent, "did it")).toThrow(PermissionError);

    store.setReviewPolicy(card.id, "auto", human);
    expect(() => store.transitionCard(card.id, "done", agent)).toThrow(ValidationError);
    expect(store.transitionCard(card.id, "done", agent, "ran clean").state).toBe("done");
  });

  it("tracks pausedFrom through a block and resume round-trip", () => {
    const card = delegatedCard();
    const blocked = store.transitionCard(card.id, "blocked", agent, "need repo access");
    expect(blocked.pausedFrom).toBe("in_progress");

    expect(() => store.transitionCard(card.id, "ready", agent)).toThrow(PermissionError);

    const resumed = store.transitionCard(card.id, "in_progress", agent);
    expect(resumed.state).toBe("in_progress");
    expect(resumed.pausedFrom).toBeNull();
  });

  it("records the ownership regime on each transition event", () => {
    const card = delegatedCard();
    const events = store.listEvents(card.id);
    const pickup = events.at(-1)!;
    expect(pickup).toMatchObject({
      type: "state_transitioned",
      fromState: "ready",
      toState: "in_progress",
      actorId: "agent-1",
      actorType: "agent",
      executor: "agent",
      reviewPolicy: "reviewed",
    });
  });

  it("throws NotFoundError for a missing card", () => {
    expect(() => store.transitionCard("nope", "backlog", human)).toThrow(NotFoundError);
  });
});

describe("executor and review policy", () => {
  it("only a human changes them; changes are audit events", () => {
    const card = store.createCard({ title: "capture" }, human);
    expect(() => store.setExecutor(card.id, "agent", agent)).toThrow(PermissionError);
    expect(() => store.setReviewPolicy(card.id, "auto", agent)).toThrow(PermissionError);

    store.setExecutor(card.id, "agent", human, "offloading");
    store.setReviewPolicy(card.id, "auto", human);

    const [, executorChange, policyChange] = store.listEvents(card.id);
    expect(executorChange).toMatchObject({
      type: "executor_changed",
      actorType: "human",
      executor: "agent",
      note: "offloading",
      payload: { from: "unassigned", to: "agent" },
    });
    expect(policyChange).toMatchObject({
      type: "review_policy_changed",
      reviewPolicy: "auto",
      payload: { from: "reviewed", to: "auto" },
    });
  });

  it("rejects a no-op change", () => {
    const card = store.createCard({ title: "capture" }, human);
    expect(() => store.setExecutor(card.id, "unassigned", human)).toThrow(ValidationError);
    expect(() => store.setReviewPolicy(card.id, "reviewed", human)).toThrow(ValidationError);
  });
});

describe("annotations", () => {
  it("any actor may annotate any card without transition permission", () => {
    const card = store.createCard({ title: "the human's card" }, human);
    const annotation = store.addAnnotation(card.id, "I could take this", agent);
    expect(annotation).toMatchObject({
      type: "annotation_added",
      actorId: "agent-1",
      note: "I could take this",
    });
    // The projection is untouched: annotations live only in the log.
    expect(store.getCard(card.id)!.updatedAt).toBe(card.updatedAt);
  });

  it("requires a non-empty note", () => {
    const card = store.createCard({ title: "capture" }, human);
    expect(() => store.addAnnotation(card.id, " ", agent)).toThrow(ValidationError);
  });
});

describe("updateCard", () => {
  it("lets a human edit title and description, recording a card_updated event", () => {
    const card = store.createCard({ title: "draft", description: "rough" }, human);
    const updated = store.updateCard(card.id, { title: "refined" }, human);
    expect(updated).toMatchObject({ title: "refined", description: "rough" });

    const events = store.listEvents(card.id);
    expect(events.at(-1)).toMatchObject({
      type: "card_updated",
      actorType: "human",
      payload: { title: "refined", description: "rough" },
    });
  });

  it("refuses agent edits — the definition is what the human reviews", () => {
    const card = delegatedCard();
    expect(() => store.updateCard(card.id, { title: "rewritten" }, agent)).toThrow(
      PermissionError,
    );
  });

  it("refuses empty edits, blank titles, and edits to terminal cards", () => {
    const card = store.createCard({ title: "x" }, human);
    expect(() => store.updateCard(card.id, {}, human)).toThrow(ValidationError);
    expect(() => store.updateCard(card.id, { title: "  " }, human)).toThrow(ValidationError);

    store.transitionCard(card.id, "cancelled", human);
    expect(() => store.updateCard(card.id, { title: "y" }, human)).toThrow(ValidationError);
  });
});

describe("listCards", () => {
  it("filters by state and executor", () => {
    store.createCard({ title: "a" }, human);
    const b = delegatedCard("ready");
    expect(store.listCards()).toHaveLength(2);
    expect(store.listCards({ state: "inbox" }).map((c) => c.title)).toEqual(["a"]);
    expect(store.listCards({ state: "ready", executor: "agent" }).map((c) => c.id)).toEqual([b.id]);
    expect(store.listCards({ state: "done" })).toEqual([]);
  });
});

describe("rebuildProjection", () => {
  it("reconstructs the cards table from the event log alone", () => {
    // Build varied history: a finished delegated card, a paused card, an
    // annotated inbox card.
    const finished = delegatedCard();
    store.transitionCard(finished.id, "manual_review", agent, "summary; next steps");
    store.transitionCard(finished.id, "done", human, "approved");

    const paused = delegatedCard();
    store.transitionCard(paused.id, "blocked", agent, "need credentials");

    const captured = store.createCard({ title: "idea", description: "raw" }, agent);
    store.addAnnotation(captured.id, "I could take this", agent);
    store.updateCard(captured.id, { title: "sharper idea" }, human);

    const before = store.listCards();
    db.prepare("UPDATE cards SET state = 'inbox', executor = 'unassigned'").run(); // corrupt it
    rebuildProjection(db);
    expect(store.listCards()).toEqual(before);
  });
});
