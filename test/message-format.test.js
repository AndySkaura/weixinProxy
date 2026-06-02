import { describe, expect, it } from "vitest";

import {
  buildSendMessagePayload,
  buildTextItem,
  extractPlainText,
} from "../src/message-format.js";

describe("message formatting", () => {
  it("extracts text items from inbound item_list", () => {
    expect(
      extractPlainText([
        { type: 1, text_item: { text: "hello" } },
        { type: 2, image_item: {} },
        { type: 1, text_item: { text: " world " } },
      ]),
    ).toBe("hello world");
  });

  it("builds text send payload expected by the iLink protocol", () => {
    const item = buildTextItem("你好");
    expect(item).toEqual({ type: 1, text_item: { text: "你好" } });

    expect(
      buildSendMessagePayload({
        toUserId: "peer",
        contextToken: "ctx",
        text: "你好",
        clientId: "client-id",
      }),
    ).toEqual({
      base_info: {
        channel_version: "weixin-proxy-ilink",
      },
      msg: {
        from_user_id: "",
        to_user_id: "peer",
        client_id: "client-id",
        message_type: 2,
        message_state: 2,
        context_token: "ctx",
        item_list: [{ type: 1, text_item: { text: "你好" } }],
      },
    });
  });
});
