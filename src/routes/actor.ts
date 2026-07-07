/**
 * Resolve the acting credential for a request.
 *
 * INTERIM (roadmap item 4 replaces this): the caller self-identifies with
 * `x-actor-type` (human | agent) and `x-actor-id` headers. The design
 * requires actor type derived from an authenticated credential — never a
 * client-supplied claim — so real auth swaps the internals of this module
 * for a token lookup. Routes only ever see the resolved `StoreActor`, so
 * nothing else changes when it does.
 */

import type { FastifyRequest } from "fastify";
import type { StoreActor } from "../persistence/card-store.js";

/** The request carries no usable credential. Maps to 401. */
export class UnauthorizedError extends Error {}

export function resolveActor(request: FastifyRequest): StoreActor {
  const type = request.headers["x-actor-type"];
  const id = request.headers["x-actor-id"];
  if (type !== "human" && type !== "agent") {
    throw new UnauthorizedError("x-actor-type header must be 'human' or 'agent'");
  }
  if (typeof id !== "string" || id.trim() === "") {
    throw new UnauthorizedError("x-actor-id header is required");
  }
  return { id: id.trim(), type };
}
