import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

/** Interim credential headers (replaced by tokens in roadmap item 4). */
const asHuman = { "x-actor-type": "human", "x-actor-id": "human-1" };
const asAgent = { "x-actor-type": "agent", "x-actor-id": "agent-1" };

let app: FastifyInstance;

beforeEach(async () => {
  app = buildApp({ dbPath: ":memory:" });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

async function createCard(title = "a task"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/cards",
    headers: asHuman,
    payload: { title },
  });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}

/** Create a card, hand it to the agent, and walk it to in_progress. */
async function delegatedCard(): Promise<string> {
  const id = await createCard("delegated task");
  const steps = [
    { url: `/cards/${id}/executor`, payload: { executor: "agent" }, headers: asHuman },
    { url: `/cards/${id}/transition`, payload: { to: "backlog" }, headers: asHuman },
    { url: `/cards/${id}/transition`, payload: { to: "ready" }, headers: asHuman },
    { url: `/cards/${id}/transition`, payload: { to: "in_progress" }, headers: asAgent },
  ];
  for (const step of steps) {
    const res = await app.inject({ method: "POST", ...step });
    expect(res.statusCode).toBe(200);
  }
  return id;
}

describe("POST /cards", () => {
  it("creates a card in inbox and returns 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/cards",
      headers: asAgent,
      payload: { title: "proposed work", description: "details" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      title: "proposed work",
      description: "details",
      state: "inbox",
      executor: "unassigned",
      reviewPolicy: "reviewed",
      pausedFrom: null,
    });
  });

  it("rejects a request without credential headers with 401", async () => {
    const res = await app.inject({ method: "POST", url: "/cards", payload: { title: "x" } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error");
  });

  it("rejects a schema-invalid body with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/cards",
      headers: asHuman,
      payload: { description: "no title" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /cards and GET /cards/:id", () => {
  it("lists cards with state/executor filters", async () => {
    const first = await createCard("one");
    await createCard("two");
    await app.inject({
      method: "POST",
      url: `/cards/${first}/executor`,
      headers: asHuman,
      payload: { executor: "agent" },
    });

    const all = await app.inject({ method: "GET", url: "/cards" });
    expect(all.json()).toHaveLength(2);

    const agents = await app.inject({ method: "GET", url: "/cards?executor=agent" });
    expect(agents.json()).toHaveLength(1);
    expect(agents.json()[0].id).toBe(first);

    const none = await app.inject({ method: "GET", url: "/cards?state=done" });
    expect(none.json()).toEqual([]);
  });

  it("rejects an unknown filter value with 400", async () => {
    const res = await app.inject({ method: "GET", url: "/cards?state=bogus" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for a missing card", async () => {
    const res = await app.inject({ method: "GET", url: "/cards/nope" });
    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /cards/:id", () => {
  it("lets a human edit title and description", async () => {
    const id = await createCard("draft");
    const res = await app.inject({
      method: "PATCH",
      url: `/cards/${id}`,
      headers: asHuman,
      payload: { title: "refined", description: "sharper scope" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ title: "refined", description: "sharper scope" });
  });

  it("refuses an agent edit with 403 — agents propose via annotation", async () => {
    const id = await createCard();
    const res = await app.inject({
      method: "PATCH",
      url: `/cards/${id}`,
      headers: asAgent,
      payload: { title: "rewritten" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("POST /cards/:id/transition", () => {
  it("walks the delegated lifecycle to done", async () => {
    const id = await delegatedCard();

    const review = await app.inject({
      method: "POST",
      url: `/cards/${id}/transition`,
      headers: asAgent,
      payload: { to: "manual_review", note: "done; next: ship it" },
    });
    expect(review.statusCode).toBe(200);
    expect(review.json().state).toBe("manual_review");

    const done = await app.inject({
      method: "POST",
      url: `/cards/${id}/transition`,
      headers: asHuman,
      payload: { to: "done", note: "looks good" },
    });
    expect(done.statusCode).toBe(200);
    expect(done.json().state).toBe("done");
  });

  it("fails closed with 403 when an agent tries a human-only transition", async () => {
    const id = await createCard();
    const res = await app.inject({
      method: "POST",
      url: `/cards/${id}/transition`,
      headers: asAgent,
      payload: { to: "backlog" },
    });
    expect(res.statusCode).toBe(403);

    const card = await app.inject({ method: "GET", url: `/cards/${id}` });
    expect(card.json().state).toBe("inbox");
  });

  it("returns 400 when a required note is missing", async () => {
    const id = await delegatedCard();
    const res = await app.inject({
      method: "POST",
      url: `/cards/${id}/transition`,
      headers: asAgent,
      payload: { to: "manual_review" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for a missing card", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/cards/nope/transition",
      headers: asHuman,
      payload: { to: "backlog" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /cards/:id/executor and /review-policy", () => {
  it("refuses an agent changing executor or review policy with 403", async () => {
    const id = await createCard();
    const executor = await app.inject({
      method: "POST",
      url: `/cards/${id}/executor`,
      headers: asAgent,
      payload: { executor: "agent" },
    });
    expect(executor.statusCode).toBe(403);

    const policy = await app.inject({
      method: "POST",
      url: `/cards/${id}/review-policy`,
      headers: asAgent,
      payload: { reviewPolicy: "auto" },
    });
    expect(policy.statusCode).toBe(403);
  });

  it("lets a human grant auto, and the agent then closes directly", async () => {
    const id = await delegatedCard();
    const grant = await app.inject({
      method: "POST",
      url: `/cards/${id}/review-policy`,
      headers: asHuman,
      payload: { reviewPolicy: "auto", note: "trusted routine" },
    });
    expect(grant.statusCode).toBe(200);

    const done = await app.inject({
      method: "POST",
      url: `/cards/${id}/transition`,
      headers: asAgent,
      payload: { to: "done", note: "ran clean" },
    });
    expect(done.statusCode).toBe(200);
    expect(done.json().state).toBe("done");
  });
});

describe("POST /cards/:id/annotations and GET /cards/:id/events", () => {
  it("lets any actor annotate and exposes the audit trail", async () => {
    const id = await createCard();
    const annotation = await app.inject({
      method: "POST",
      url: `/cards/${id}/annotations`,
      headers: asAgent,
      payload: { note: "I could take this" },
    });
    expect(annotation.statusCode).toBe(201);
    expect(annotation.json()).toMatchObject({
      type: "annotation_added",
      actorId: "agent-1",
      actorType: "agent",
      note: "I could take this",
    });

    const events = await app.inject({ method: "GET", url: `/cards/${id}/events` });
    expect(events.statusCode).toBe(200);
    expect(events.json().map((e: { type: string }) => e.type)).toEqual([
      "card_created",
      "annotation_added",
    ]);
  });

  it("returns 404 for events of a missing card", async () => {
    const res = await app.inject({ method: "GET", url: "/cards/nope/events" });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /openapi.json", () => {
  it("serves an OpenAPI spec covering the card routes", async () => {
    const res = await app.inject({ method: "GET", url: "/openapi.json" });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toMatch(/^3\./);
    for (const path of [
      "/cards",
      "/cards/{id}",
      "/cards/{id}/transition",
      "/cards/{id}/executor",
      "/cards/{id}/review-policy",
      "/cards/{id}/annotations",
      "/cards/{id}/events",
    ]) {
      expect(spec.paths).toHaveProperty(path);
    }
  });
});
