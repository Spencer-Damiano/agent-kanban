import { describe, expect, it } from "vitest";
import { createActorResolver, credentialsFromEnv } from "../src/routes/actor.js";

describe("credentialsFromEnv", () => {
  it("parses comma-separated id:token pairs from both variables", () => {
    expect(
      credentialsFromEnv({
        HUMAN_TOKENS: "alex:h1",
        AGENT_TOKENS: "bot:a1, helper:a2",
      }),
    ).toEqual([
      { id: "alex", type: "human", token: "h1" },
      { id: "bot", type: "agent", token: "a1" },
      { id: "helper", type: "agent", token: "a2" },
    ]);
  });

  it("returns an empty set when neither variable is set", () => {
    expect(credentialsFromEnv({})).toEqual([]);
  });

  it("rejects entries that are not id:token pairs", () => {
    expect(() => credentialsFromEnv({ HUMAN_TOKENS: "no-separator" })).toThrow(/id:token/);
    expect(() => credentialsFromEnv({ AGENT_TOKENS: "bot:" })).toThrow(/id:token/);
  });
});

describe("createActorResolver", () => {
  it("refuses to build without credentials or with duplicate tokens", () => {
    expect(() => createActorResolver([])).toThrow(/no API credentials/);
    expect(() =>
      createActorResolver([
        { id: "a", type: "human", token: "same" },
        { id: "b", type: "agent", token: "same" },
      ]),
    ).toThrow(/unique/);
  });
});
