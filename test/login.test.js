import { describe, expect, it } from "vitest";

import { parseLoginStatus } from "../src/weixin-client.js";

describe("parseLoginStatus", () => {
  it("maps confirmed login payload into persisted account fields", () => {
    expect(
      parseLoginStatus(
        {
          status: "confirmed",
          bot_token: "token",
          ilink_bot_id: "bot-id",
          ilink_user_id: "user-id",
          baseurl: "https://example.com/",
        },
        "https://default.example",
      ),
    ).toEqual({
      status: "created",
      qrStatus: "confirmed",
      token: "token",
      accountId: "bot-id",
      userId: "user-id",
      baseUrl: "https://example.com",
    });
  });

  it("keeps pending, expired, and denied states explicit", () => {
    expect(parseLoginStatus({ status: "wait" }, "https://default.example")).toEqual({
      status: "pending",
      qrStatus: "wait",
    });
    expect(parseLoginStatus({ status: "expired" }, "https://default.example")).toEqual({
      status: "expired",
      qrStatus: "expired",
      message: "二维码已过期",
    });
    expect(parseLoginStatus({ status: "cancel" }, "https://default.example")).toEqual({
      status: "denied",
      qrStatus: "cancel",
      message: "用户取消登录",
    });
  });
});
