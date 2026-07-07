import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("GET /health", () => {
  it("returns ok without requiring a token", async () => {
    const app = buildApp({
      dbPath: ":memory:",
      credentials: [{ id: "human-1", type: "human", token: "t" }],
    });
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });

    await app.close();
  });
});
