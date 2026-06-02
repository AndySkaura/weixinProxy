import {
  DEFAULT_API_TIMEOUT_MS,
  DEFAULT_BASE_URL,
  DEFAULT_BOT_TYPE,
  DEFAULT_CDN_BASE_URL,
  DEFAULT_LONG_POLL_TIMEOUT_MS,
  DEFAULT_MEDIA_DIR,
  DEFAULT_QR_POLL_INTERVAL_MS,
  DEFAULT_STATE_PATH,
  normalizeBaseUrl,
} from "./config.js";
import { CdnClient } from "./cdn-client.js";
import { MediaService } from "./media.js";
import { StateStore } from "./state-store.js";
import {
  SessionTimeoutError,
  applyUpdatesToState,
  createSendMessageError,
  isSuccessfulPayload,
} from "./update-state.js";
import { WeixinClient } from "./weixin-client.js";

export class WeixinProxyBot {
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
    this.botType = options.botType || DEFAULT_BOT_TYPE;
    this.apiTimeoutMs = options.apiTimeoutMs || DEFAULT_API_TIMEOUT_MS;
    this.longPollTimeoutMs =
      options.longPollTimeoutMs || DEFAULT_LONG_POLL_TIMEOUT_MS;
    this.qrPollIntervalMs =
      options.qrPollIntervalMs || DEFAULT_QR_POLL_INTERVAL_MS;
    this.cdnBaseUrl = options.cdnBaseUrl || DEFAULT_CDN_BASE_URL;
    this.mediaDir = options.mediaDir || DEFAULT_MEDIA_DIR;
    this.store =
      options.store || new StateStore(options.statePath || DEFAULT_STATE_PATH);
    this.client =
      options.client ||
      new WeixinClient({
        baseUrl: this.baseUrl,
        timeoutMs: this.apiTimeoutMs,
        fetchImpl: options.fetchImpl || fetch,
      });
    this.cdnClient =
      options.cdnClient ||
      new CdnClient({
        baseUrl: this.cdnBaseUrl,
        timeoutMs: this.apiTimeoutMs,
        fetchImpl: options.fetchImpl || fetch,
      });
    this.media =
      options.media ||
      new MediaService({
        client: this.client,
        cdnClient: this.cdnClient,
        mediaDir: this.mediaDir,
      });
    this.messageHandlers = new Set();
    this.errorHandlers = new Set();
    this.controller = null;
    this.runningPromise = null;
  }

  onMessage(handler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onError(handler) {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  async login({ onQr = () => {}, onStatus = () => {} } = {}) {
    const state = await this.store.load();
    this.configureClient(state);
    const qr = await this.client.requestLoginQr(this.botType);
    const qrcode = stringValue(qr.qrcode);
    const content = stringValue(qr.qrcode_img_content);
    if (!qrcode || !content) {
      throw new Error("二维码响应格式异常，缺少 qrcode 或 qrcode_img_content");
    }

    onQr({ qrcode, content });

    while (true) {
      const result = await this.client.pollLoginStatus(
        qrcode,
        this.longPollTimeoutMs,
      );
      onStatus(result);
      if (result.status === "created") {
        const next = {
          ...state,
          token: result.token,
          accountId: result.accountId,
          userId: result.userId,
          baseUrl: normalizeBaseUrl(result.baseUrl || this.baseUrl),
        };
        await this.store.save(next);
        this.configureClient(next);
        return result;
      }
      if (["expired", "denied", "error"].includes(result.status)) {
        throw new Error(result.message || `登录失败: ${result.qrStatus}`);
      }
      await sleep(this.qrPollIntervalMs);
    }
  }

  async isLoggedIn() {
    const state = await this.store.load();
    return Boolean(state.token);
  }

  async sessions() {
    const state = await this.store.load();
    return state.sessions;
  }

  async receiveOnce() {
    const state = await this.requireLoggedInState();
    this.configureClient(state);
    const data = await this.client.getUpdates(
      state.syncBuf,
      this.longPollTimeoutMs,
    );
    return this.applyUpdates(data, state);
  }

  async start() {
    if (this.runningPromise) {
      return this.runningPromise;
    }
    this.controller = new AbortController();
    this.runningPromise = this.runLoop(this.controller.signal).finally(() => {
      this.runningPromise = null;
      this.controller = null;
    });
    return this.runningPromise;
  }

  stop() {
    this.controller?.abort();
  }

  async send(toUserId, text) {
    if (!toUserId || !text) {
      throw new Error("send(toUserId, text) 需要目标 user id 和文本内容");
    }
    const state = await this.requireLoggedInState();
    this.configureClient(state);
    const contextToken = this.requireContextToken(state, toUserId);
    const response = await this.client.sendText({
      toUserId,
      contextToken,
      text,
    });
    if (!isSuccessfulPayload(response)) {
      throw createSendMessageError(response, toUserId);
    }
    return response;
  }

  async sendImage(toUserId, filePath, options = {}) {
    return this.sendMedia(toUserId, () => this.media.buildImageItem(toUserId, filePath, options));
  }

  async sendFile(toUserId, filePath) {
    return this.sendMedia(toUserId, () => this.media.buildFileItem(toUserId, filePath));
  }

  async sendVideo(toUserId, filePath, options = {}) {
    return this.sendMedia(toUserId, () => this.media.buildVideoItem(toUserId, filePath, options));
  }

  async sendMedia(toUserId, buildItem) {
    if (!toUserId) {
      throw new Error("发送媒体需要目标 user id");
    }
    const state = await this.requireLoggedInState();
    this.configureClient(state);
    const contextToken = this.requireContextToken(state, toUserId);
    const response = await this.client.sendItems({
      toUserId,
      contextToken,
      itemList: [await buildItem()],
    });
    if (!isSuccessfulPayload(response)) {
      throw createSendMessageError(response, toUserId);
    }
    return response;
  }

  async requireLoggedInState() {
    const state = await this.store.load();
    if (!state.token) {
      throw new Error("尚未登录，请先调用 bot.login()");
    }
    return state;
  }

  configureClient(state) {
    const baseUrl = state.baseUrl || this.baseUrl;
    if (typeof this.client.setBaseUrl === "function") {
      this.client.setBaseUrl(baseUrl);
    }
    if (typeof this.client.setToken === "function") {
      this.client.setToken(state.token || "");
    }
  }

  async runLoop(signal) {
    let state = await this.requireLoggedInState();
    this.configureClient(state);
    while (!signal.aborted) {
      try {
        const data = await this.client.getUpdates(
          state.syncBuf,
          this.longPollTimeoutMs,
          signal,
        );
        state = await this.applyUpdates(data, state);
      } catch (error) {
        if (error?.name === "AbortError" && signal.aborted) {
          return;
        }
        this.emitError(error);
        if (error instanceof SessionTimeoutError) {
          throw error;
        }
        await sleep(5000);
      }
    }
  }

  async applyUpdates(data, state) {
    return applyUpdatesToState({
      data,
      state,
      store: this.store,
      onMessage: (message) => this.emitMessage(message),
      resolveAttachments: (attachments) => this.media.downloadAttachments(attachments),
    });
  }

  requireContextToken(state, toUserId) {
    const contextToken = state.contextTokens[toUserId];
    if (!contextToken) {
      throw new Error(
        `缺少 ${toUserId} 的 context_token。请先让对方给你发一条消息，并调用 start() 或 receiveOnce() 接收。`,
      );
    }
    return contextToken;
  }

  emitMessage(message) {
    for (const handler of this.messageHandlers) {
      handler(message);
    }
  }

  emitError(error) {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }
}

export function createWeixinProxyBot(options = {}) {
  return new WeixinProxyBot(options);
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
