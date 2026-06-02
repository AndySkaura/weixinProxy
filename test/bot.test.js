import { describe, expect, it, vi } from "vitest";

import { WeixinProxyBot, createWeixinProxyBot } from "../src/bot.js";

function makeStore(initialState = {}) {
  let state = {
    baseUrl: "",
    token: "",
    accountId: "",
    userId: "",
    syncBuf: "",
    contextTokens: {},
    sessions: {},
    ...initialState,
  };
  return {
    async load() {
      return state;
    },
    async save(next) {
      state = next;
    },
    get state() {
      return state;
    },
  };
}

describe("WeixinProxyBot", () => {
  it("creates a high-level bot with sensible defaults", () => {
    const bot = createWeixinProxyBot({ store: makeStore() });

    expect(bot).toBeInstanceOf(WeixinProxyBot);
  });

  it("logs in with QR callback and persists confirmed credentials", async () => {
    const store = makeStore();
    const client = {
      requestLoginQr: vi.fn(async () => ({
        qrcode: "qr-id",
        qrcode_img_content: "qr-content",
      })),
      pollLoginStatus: vi.fn(async () => ({
        status: "created",
        qrStatus: "confirmed",
        token: "token",
        accountId: "account",
        userId: "user",
        baseUrl: "https://example.com",
      })),
      setToken: vi.fn(),
      setBaseUrl: vi.fn(),
    };
    const onQr = vi.fn();
    const onStatus = vi.fn();

    const bot = new WeixinProxyBot({ store, client, qrPollIntervalMs: 1 });
    const result = await bot.login({ onQr, onStatus });

    expect(result).toMatchObject({ token: "token", accountId: "account" });
    expect(onQr).toHaveBeenCalledWith({
      qrcode: "qr-id",
      content: "qr-content",
    });
    expect(onStatus).toHaveBeenCalledWith({
      status: "created",
      qrStatus: "confirmed",
      token: "token",
      accountId: "account",
      userId: "user",
      baseUrl: "https://example.com",
    });
    expect(store.state).toMatchObject({
      token: "token",
      accountId: "account",
      userId: "user",
      baseUrl: "https://example.com",
    });
  });

  it("receives one update, emits a message, and stores the context token", async () => {
    const store = makeStore({ token: "token", baseUrl: "https://example.com" });
    const client = {
      getUpdates: vi.fn(async () => ({
        ret: 0,
        get_updates_buf: "cursor",
        msgs: [
          {
            from_user_id: "peer",
            context_token: "ctx",
            item_list: [{ type: 1, text_item: { text: "hello" } }],
          },
        ],
      })),
    };
    const messageHandler = vi.fn();

    const bot = new WeixinProxyBot({ store, client });
    bot.onMessage(messageHandler);
    const state = await bot.receiveOnce();

    expect(state.syncBuf).toBe("cursor");
    expect(state.contextTokens.peer).toBe("ctx");
    expect(messageHandler).toHaveBeenCalledWith(
      expect.objectContaining({ fromUserId: "peer", text: "hello" }),
    );
  });

  it("sends text using the stored context token", async () => {
    const store = makeStore({
      token: "token",
      baseUrl: "https://example.com",
      contextTokens: { peer: "ctx" },
    });
    const client = {
      sendText: vi.fn(async () => ({ ret: 0 })),
    };

    const bot = new WeixinProxyBot({ store, client });
    await expect(bot.send("peer", "hello")).resolves.toEqual({ ret: 0 });

    expect(client.sendText).toHaveBeenCalledWith({
      toUserId: "peer",
      contextToken: "ctx",
      text: "hello",
    });
  });

  it("explains why a user cannot be sent to before context token exists", async () => {
    const bot = new WeixinProxyBot({
      store: makeStore({ token: "token", baseUrl: "https://example.com" }),
      client: { sendText: vi.fn() },
    });

    await expect(bot.send("peer", "hello")).rejects.toThrow(
      "缺少 peer 的 context_token",
    );
  });

  it("explains how to refresh an expired context token", async () => {
    const bot = new WeixinProxyBot({
      store: makeStore({
        token: "token",
        baseUrl: "https://example.com",
        contextTokens: { peer: "expired-ctx" },
      }),
      client: { sendText: vi.fn(async () => ({ ret: -2 })) },
    });

    await expect(bot.send("peer", "hello")).rejects.toThrow(
      "peer 的 context_token 已失效",
    );
  });

  it("uploads and sends a file item using the stored context token", async () => {
    const client = { sendItems: vi.fn(async () => ({ ret: 0 })) };
    const media = { buildFileItem: vi.fn(async () => ({ type: 4, file_item: {} })) };
    const bot = new WeixinProxyBot({
      store: makeStore({
        token: "token",
        baseUrl: "https://example.com",
        contextTokens: { peer: "ctx" },
      }),
      client,
      media,
    });

    await expect(bot.sendFile("peer", "/tmp/report.pdf")).resolves.toEqual({ ret: 0 });
    expect(media.buildFileItem).toHaveBeenCalledWith("peer", "/tmp/report.pdf");
    expect(client.sendItems).toHaveBeenCalledWith({
      toUserId: "peer",
      contextToken: "ctx",
      itemList: [{ type: 4, file_item: {} }],
    });
  });
});
