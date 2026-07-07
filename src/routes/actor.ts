/**
 * Credential-based actor resolution (roadmap item 4).
 *
 * The state machine's permission rules are keyed off the actor type of the
 * caller, so the API derives it from the authenticated credential — never
 * from anything the request claims about itself. v1 credentials are static
 * bearer tokens from config: each token is bound to an actor id and type
 * when the server starts, and a request is whoever its token says it is.
 *
 * Config: HUMAN_TOKENS and AGENT_TOKENS env vars, each a comma-separated
 * list of `id:token` pairs, e.g. `HUMAN_TOKENS="alex:s3cret"`. Rotation is
 * editing the config and restarting — fine for a self-hosted v1.
 */

import type { FastifyRequest } from "fastify";
import type { StoreActor } from "../persistence/card-store.js";

/** The request carries no usable credential. Maps to 401. */
export class UnauthorizedError extends Error {}

export interface Credential {
  id: string;
  type: "human" | "agent";
  token: string;
}

export type ActorResolver = (request: FastifyRequest) => StoreActor;

/**
 * Build a resolver over a fixed credential set. Rejects a malformed set at
 * startup — an empty or ambiguous token table must never boot into a server
 * that quietly 401s (or worse, misattributes) everything.
 */
export function createActorResolver(credentials: Credential[]): ActorResolver {
  if (credentials.length === 0) {
    throw new Error(
      "no API credentials configured; set HUMAN_TOKENS and/or AGENT_TOKENS (comma-separated id:token pairs)",
    );
  }
  const byToken = new Map<string, StoreActor>();
  for (const credential of credentials) {
    if (!credential.id.trim() || !credential.token.trim()) {
      throw new Error("every credential requires a non-empty id and token");
    }
    if (byToken.has(credential.token)) {
      throw new Error("two credentials share the same token; tokens must be unique");
    }
    byToken.set(credential.token, { id: credential.id, type: credential.type });
  }

  return (request) => {
    const header = request.headers.authorization;
    if (header === undefined || !header.startsWith("Bearer ")) {
      throw new UnauthorizedError("authorization required: Bearer <token>");
    }
    const actor = byToken.get(header.slice("Bearer ".length).trim());
    if (actor === undefined) {
      throw new UnauthorizedError("unrecognized token");
    }
    return { ...actor };
  };
}

/** Parse HUMAN_TOKENS / AGENT_TOKENS (comma-separated `id:token` pairs). */
export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): Credential[] {
  const credentials: Credential[] = [];
  const sources = [
    { envVar: "HUMAN_TOKENS", type: "human" },
    { envVar: "AGENT_TOKENS", type: "agent" },
  ] as const;
  for (const { envVar, type } of sources) {
    const raw = env[envVar];
    if (raw === undefined || !raw.trim()) continue;
    for (const entry of raw.split(",")) {
      const pair = entry.trim();
      if (!pair) continue;
      const separator = pair.indexOf(":");
      if (separator <= 0 || separator === pair.length - 1) {
        throw new Error(`${envVar}: each entry must be an "id:token" pair`);
      }
      credentials.push({
        id: pair.slice(0, separator).trim(),
        type,
        token: pair.slice(separator + 1).trim(),
      });
    }
  }
  return credentials;
}
