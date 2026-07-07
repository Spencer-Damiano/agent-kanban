import Fastify, { type FastifyInstance } from "fastify";

/**
 * Build the Fastify app without binding to a port, so tests can exercise
 * routes via `app.inject()` and the entry point decides how to listen.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  return app;
}
