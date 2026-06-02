import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { StateStore } from "../src/state-store.js";

const tempDirs = [];

async function makeStore() {
  const dir = await mkdtemp(join(tmpdir(), "weixin-proxy-test-"));
  tempDirs.push(dir);
  return new StateStore(join(dir, "state.json"));
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("StateStore", () => {
  it("returns a default empty state when no file exists", async () => {
    const store = await makeStore();

    await expect(store.load()).resolves.toEqual({
      baseUrl: "",
      token: "",
      accountId: "",
      userId: "",
      syncBuf: "",
      contextTokens: {},
      sessions: {},
    });
  });

  it("persists credentials, sync cursor, and context tokens", async () => {
    const store = await makeStore();

    await store.save({
      baseUrl: "https://example.com",
      token: "token",
      accountId: "account",
      userId: "user",
      syncBuf: "cursor",
      contextTokens: { peer: "ctx" },
      sessions: { peer: { lastText: "hi", updatedAt: 123 } },
    });

    await expect(store.load()).resolves.toMatchObject({
      baseUrl: "https://example.com",
      token: "token",
      syncBuf: "cursor",
      contextTokens: { peer: "ctx" },
      sessions: { peer: { lastText: "hi", updatedAt: 123 } },
    });
  });
});
