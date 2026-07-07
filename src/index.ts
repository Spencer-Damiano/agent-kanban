import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

const app = buildApp();

try {
  await app.listen({ port, host });
  console.log(`agent-kanban API listening on http://${host}:${port}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
