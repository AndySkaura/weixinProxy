import { describe, expect, it, vi } from "vitest";

import { WeixinClient } from "../src/weixin-client.js";

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("WeixinClient", () => {
  it("requests login QR from the iLink protocol endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ qrcode: "qr", qrcode_img_content: "content" }),
    );
    const client = new WeixinClient({
      baseUrl: "https://ilinkai.weixin.qq.com/",
      fetchImpl,
    });

    await expect(client.requestLoginQr("3")).resolves.toEqual({
      qrcode: "qr",
      qrcode_img_content: "content",
    });

    const [url, request] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(
      "https://ilinkai.weixin.qq.com/ilink/bot/get_bot_qrcode?bot_type=3",
    );
    expect(request.method).toBe("GET");
    expect(request.headers.Authorization).toBeUndefined();
    expect(request.headers.AuthorizationType).toBe("ilink_bot_token");
    expect(request.headers["X-WECHAT-UIN"]).toMatch(/^[A-Za-z0-9+/]+=*$/u);
  });

  it("sends getupdates with token and sync cursor", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ret: 0, msgs: [] }));
    const client = new WeixinClient({
      baseUrl: "https://ilinkai.weixin.qq.com",
      token: "token",
      fetchImpl,
    });

    await client.getUpdates("cursor", 1000);

    const [url, request] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://ilinkai.weixin.qq.com/ilink/bot/getupdates");
    expect(request.method).toBe("POST");
    expect(request.headers.Authorization).toBe("Bearer token");
    expect(JSON.parse(request.body)).toEqual({
      base_info: { channel_version: "weixin-proxy-ilink" },
      get_updates_buf: "cursor",
    });
  });

  it("sends text payload with context token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ret: 0 }));
    const client = new WeixinClient({
      baseUrl: "https://ilinkai.weixin.qq.com",
      token: "token",
      fetchImpl,
    });

    await client.sendText({
      toUserId: "peer",
      contextToken: "ctx",
      text: "hello",
      clientId: "client-id",
    });

    const [, request] = fetchImpl.mock.calls[0];
    expect(JSON.parse(request.body)).toMatchObject({
      msg: {
        to_user_id: "peer",
        context_token: "ctx",
        item_list: [{ type: 1, text_item: { text: "hello" } }],
      },
    });
  });

  it("requests a CDN upload URL with encrypted file metadata", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ upload_full_url: "https://cdn/upload" }));
    const client = new WeixinClient({
      baseUrl: "https://ilinkai.weixin.qq.com",
      token: "token",
      fetchImpl,
    });

    await client.getUploadUrl({
      filekey: "file-key",
      mediaType: 3,
      toUserId: "peer",
      rawsize: 10,
      rawfilemd5: "md5",
      filesize: 16,
      noNeedThumb: true,
      aeskey: "aes-key",
    });

    const [url, request] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://ilinkai.weixin.qq.com/ilink/bot/getuploadurl");
    expect(JSON.parse(request.body)).toMatchObject({
      filekey: "file-key",
      media_type: 3,
      to_user_id: "peer",
      rawsize: 10,
      rawfilemd5: "md5",
      filesize: 16,
      no_need_thumb: true,
      aeskey: "aes-key",
    });
  });
});
