import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import { openDb } from "./persistence/db.js";
import {
  CardStore,
  NotFoundError,
  PermissionError,
  ValidationError,
} from "./persistence/card-store.js";
import {
  createActorResolver,
  credentialsFromEnv,
  UnauthorizedError,
  type Credential,
} from "./routes/actor.js";
import { apiSchemas, cardRoutes } from "./routes/cards.js";

export interface BuildAppOptions {
  /** SQLite path. Defaults to DATABASE_PATH / data/agent-kanban.db; tests pass ":memory:". */
  dbPath?: string;
  /** API credentials. Defaults to HUMAN_TOKENS / AGENT_TOKENS from the environment; the app refuses to build without at least one. */
  credentials?: Credential[];
}

/**
 * Build the Fastify app without binding to a port, so tests can exercise
 * routes via `app.inject()` and the entry point decides how to listen.
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  const resolveActor = createActorResolver(options.credentials ?? credentialsFromEnv());

  const db = openDb(options.dbPath);
  const store = new CardStore(db);
  app.addHook("onClose", () => {
    db.close();
  });

  // The store throws typed domain errors; this is the single place they
  // become HTTP responses. Anything unrecognized is a plain 500 — never
  // leak an internal error as an allowed-looking outcome.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof UnauthorizedError) return reply.code(401).send({ error: error.message });
    if (error instanceof PermissionError) return reply.code(403).send({ error: error.message });
    if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
    if (error instanceof ValidationError) return reply.code(400).send({ error: error.message });
    if (error.validation) return reply.code(400).send({ error: error.message });
    request.log.error(error);
    return reply.code(500).send({ error: "internal error" });
  });

  for (const schema of apiSchemas) {
    app.addSchema(schema);
  }

  app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "agent-kanban API",
        description:
          "Kanban board shared by one human and their AI agent(s). Actor type is derived from the credential; requests that violate the transition rules fail closed (403).",
        version: "0.0.1",
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer" },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    refResolver: {
      buildLocalReference: (json) => String(json.$id),
    },
  });

  app.get("/health", { schema: { security: [] } }, async () => {
    return { status: "ok" };
  });

  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  app.register(cardRoutes, { store, resolveActor });

  return app;
}
