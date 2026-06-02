import { randomBytes, randomUUID } from "node:crypto";

import { normalizeBaseUrl } from "./config.js";
import { CHANNEL_VERSION, buildSendMessagePayload } from "./message-format.js";

export const SESSION_TIMEOUT_ERRCODE = -14;

export function parseLoginStatus(data, defaultBaseUrl) {
  const qrStatus = stringField(data, "status") || "wait";
  if (qrStatus === "confirmed") {
    const token = stringField(data, "bot_token");
    if (!token) {
      return {
        status: "error",
        qrStatus,
        message: "登录成功但未返回 token",
      };
    }
    return {
      status: "created",
      qrStatus,
      token,
      accountId: stringField(data, "ilink_bot_id"),
      userId: stringField(data, "ilink_user_id"),
      baseUrl: normalizeBaseUrl(stringField(data, "baseurl") || defaultBaseUrl),
    };
  }
  if (qrStatus === "expired") {
    return { status: "expired", qrStatus, message: "二维码已过期" };
  }
  if (["cancel", "canceled", "denied"].includes(qrStatus)) {
    return { status: "denied", qrStatus, message: "用户取消登录" };
  }
  return { status: "pending", qrStatus };
}

export class WeixinClient {
  constructor({ baseUrl, token = "", timeoutMs = 15000, fetchImpl = fetch }) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  setToken(token) {
    this.token = token || "";
  }

  setBaseUrl(baseUrl) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async requestLoginQr(botType = "3") {
    return this.requestJson("GET", "ilink/bot/get_bot_qrcode", {
      params: { bot_type: botType },
      tokenRequired: false,
      timeoutMs: 15000,
    });
  }

  async pollLoginStatus(qrcode, timeoutMs) {
    const data = await this.requestJson("GET", "ilink/bot/get_qrcode_status", {
      params: { qrcode },
      tokenRequired: false,
      timeoutMs,
      headers: { "iLink-App-ClientVersion": "1" },
    });
    return parseLoginStatus(data, this.baseUrl);
  }

  async getUpdates(syncBuf, timeoutMs, signal) {
    return this.requestJson("POST", "ilink/bot/getupdates", {
      payload: {
        base_info: {
          channel_version: CHANNEL_VERSION,
        },
        get_updates_buf: syncBuf || "",
      },
      tokenRequired: true,
      timeoutMs,
      signal,
    });
  }

  async sendText({ toUserId, contextToken, text, clientId = randomUUID() }) {
    return this.sendItems({ toUserId, contextToken, text, clientId });
  }

  async sendItems({ toUserId, contextToken, text, itemList, clientId = randomUUID() }) {
    return this.requestJson("POST", "ilink/bot/sendmessage", {
      payload: buildSendMessagePayload({ toUserId, contextToken, text, itemList, clientId }),
      tokenRequired: true,
    });
  }

  async getUploadUrl({
    filekey,
    mediaType,
    toUserId,
    rawsize,
    rawfilemd5,
    filesize,
    thumbRawsize,
    thumbRawfilemd5,
    thumbFilesize,
    noNeedThumb,
    aeskey,
  }) {
    return this.requestJson("POST", "ilink/bot/getuploadurl", {
      payload: {
        filekey,
        media_type: mediaType,
        to_user_id: toUserId,
        rawsize,
        rawfilemd5,
        filesize,
        thumb_rawsize: thumbRawsize,
        thumb_rawfilemd5: thumbRawfilemd5,
        thumb_filesize: thumbFilesize,
        no_need_thumb: noNeedThumb,
        aeskey,
        base_info: { channel_version: CHANNEL_VERSION },
      },
      tokenRequired: true,
    });
  }

  async requestJson(method, endpoint, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);
    const externalAbort = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", externalAbort, { once: true });
      }
    }
    try {
      const url = new URL(endpoint.replace(/^\/+/u, ""), `${this.baseUrl}/`);
      for (const [key, value] of Object.entries(options.params || {})) {
        url.searchParams.set(key, value);
      }

      const response = await this.fetchImpl(url, {
        method,
        headers: {
          ...this.baseHeaders(Boolean(options.tokenRequired)),
          ...(options.headers || {}),
        },
        body: options.payload ? JSON.stringify(options.payload) : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${method} ${endpoint} failed: ${response.status} ${text}`);
      }
      return text ? JSON.parse(text) : {};
    } finally {
      clearTimeout(timeout);
      if (options.signal) {
        options.signal.removeEventListener("abort", externalAbort);
      }
    }
  }

  baseHeaders(tokenRequired) {
    const headers = {
      "Content-Type": "application/json",
      AuthorizationType: "ilink_bot_token",
      "X-WECHAT-UIN": randomUinHeader(),
    };
    if (tokenRequired && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }
}

function randomUinHeader() {
  const numberText = String(randomBytes(4).readUInt32BE(0));
  return Buffer.from(numberText, "utf8").toString("base64");
}

function stringField(data, key) {
  const value = data?.[key];
  return typeof value === "string" ? value.trim() : "";
}
