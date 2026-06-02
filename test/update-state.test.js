import { describe, expect, it, vi } from "vitest";

import {
  SessionTimeoutError,
  applyUpdatesToState,
  createSendMessageError,
} from "../src/update-state.js";

describe("applyUpdatesToState", () => {
  it("persists sync cursor, context token, and session summary", async () => {
    const store = { save: vi.fn(async () => {}) };
    const state = {
      token: "token",
      syncBuf: "",
      contextTokens: {},
      sessions: {},
    };

    const next = await applyUpdatesToState({
      data: {
        ret: 0,
        get_updates_buf: "next-cursor",
        msgs: [
          {
            from_user_id: "peer",
            context_token: "ctx",
            message_id: "msg-1",
            item_list: [{ type: 1, text_item: { text: "hello" } }],
          },
        ],
      },
      state,
      store,
      now: () => 123,
      onMessage: vi.fn(),
    });

    expect(next.syncBuf).toBe("next-cursor");
    expect(next.contextTokens.peer).toBe("ctx");
    expect(next.sessions.peer).toMatchObject({
      lastText: "hello",
      messageId: "msg-1",
      updatedAt: 123,
    });
    expect(store.save).toHaveBeenCalledWith(next);
  });

  it("clears login state and throws a typed error when session times out", async () => {
    const store = { save: vi.fn(async () => {}) };
    const state = {
      token: "token",
      syncBuf: "cursor",
      contextTokens: { peer: "ctx" },
      sessions: {},
    };

    await expect(
      applyUpdatesToState({
        data: { ret: 1, errcode: -14, errmsg: "session timeout" },
        state,
        store,
      }),
    ).rejects.toBeInstanceOf(SessionTimeoutError);

    expect(store.save).toHaveBeenCalledWith({
      token: "",
      syncBuf: "",
      contextTokens: {},
      sessions: {},
    });
  });

  it("resolves inbound media attachments before emitting the message", async () => {
    const store = { save: vi.fn(async () => {}) };
    const onMessage = vi.fn();
    const resolveAttachments = vi.fn(async (attachments) =>
      attachments.map((item) => ({ ...item, filePath: "/tmp/photo.jpg" })),
    );

    await applyUpdatesToState({
      data: {
        ret: 0,
        msgs: [{
          from_user_id: "peer",
          item_list: [{
            type: 2,
            image_item: {
              aeskey: "00112233445566778899aabbccddeeff",
              media: { encrypt_query_param: "param" },
            },
          }],
        }],
      },
      state: { syncBuf: "", contextTokens: {}, sessions: {} },
      store,
      onMessage,
      resolveAttachments,
    });

    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [expect.objectContaining({ type: "image", filePath: "/tmp/photo.jpg" })],
    }));
  });
});

describe("createSendMessageError", () => {
  it("explains how to refresh an expired context token", () => {
    expect(createSendMessageError({ ret: -2 }, "peer").message).toBe(
      "发送失败：peer 的 context_token 已失效。请让对方重新给 Bot 发送一条消息，待 listen/repl 接收后再重试。",
    );
  });

  it("keeps the server message for other errors", () => {
    expect(createSendMessageError({ ret: -1, errmsg: "server error" }).message).toBe(
      "server error",
    );
  });
});
