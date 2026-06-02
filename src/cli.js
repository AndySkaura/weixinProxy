#!/usr/bin/env node

import process from "node:process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import qrcode from "qrcode-terminal";

import { CdnClient } from "./cdn-client.js";
import { loadRuntimeConfig, normalizeBaseUrl } from "./config.js";
import { MediaService } from "./media.js";
import { extractPlainText } from "./message-format.js";
import { StateStore } from "./state-store.js";
import {
  SessionTimeoutError,
  applyUpdatesToState,
  createSendMessageError,
  isSuccessfulPayload,
} from "./update-state.js";
import { WeixinClient } from "./weixin-client.js";

const HELP = `
wxilink - 基于 iLink 协议的微信 Bot

用法:
  wxilink login
  wxilink listen
  wxilink send <user_id> <text>
  wxilink send-image <user_id> <file_path>
  wxilink send-file <user_id> <file_path>
  wxilink send-video <user_id> <file_path>
  wxilink repl

项目内运行:
  npm run login
  npm run listen
  npm run send -- <user_id> <text>
  npm run send-image -- <user_id> <file_path>
  npm run send-file -- <user_id> <file_path>
  npm run send-video -- <user_id> <file_path>
  npm run repl

环境变量:
  WEIXIN_OC_BASE_URL              默认 https://ilinkai.weixin.qq.com
  WEIXIN_OC_BOT_TYPE              默认 3
  WEIXIN_PROXY_STATE              默认 .weixin-proxy/state.json
  WEIXIN_PROXY_MEDIA_DIR          默认 .weixin-proxy/media
  WEIXIN_OC_CDN_BASE_URL          默认 https://novac2c.cdn.weixin.qq.com/c2c
  WEIXIN_OC_API_TIMEOUT_MS        默认 15000
  WEIXIN_OC_LONG_POLL_TIMEOUT_MS  默认 35000
`;

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || "help";
  const config = loadRuntimeConfig();
  const store = new StateStore(config.statePath);

  if (command === "--help" || command === "-h" || command === "help") {
    output.write(HELP.trimStart());
    return;
  }

  if (command === "login") {
    await login({ config, store });
    return;
  }

  if (command === "listen") {
    await listen({ config, store });
    return;
  }

  if (command === "send") {
    await send({ config, store, toUserId: argv[1], text: argv.slice(2).join(" ") });
    return;
  }

  if (["send-image", "send-file", "send-video"].includes(command)) {
    await sendMedia({ config, store, type: command.slice(5), toUserId: argv[1], filePath: argv[2] });
    return;
  }

  if (command === "repl") {
    await repl({ config, store });
    return;
  }

  throw new Error(`未知命令: ${command}\n\n${HELP}`);
}

async function login({ config, store }) {
  const state = await store.load();
  const client = new WeixinClient({
    baseUrl: state.baseUrl || config.baseUrl,
    token: state.token,
    timeoutMs: config.apiTimeoutMs,
  });
  output.write("正在请求微信扫码登录二维码...\n");
  const qr = await client.requestLoginQr(config.botType);
  const qrcodeId = stringValue(qr.qrcode);
  const qrContent = stringValue(qr.qrcode_img_content);
  if (!qrcodeId || !qrContent) {
    throw new Error("二维码响应格式异常，缺少 qrcode 或 qrcode_img_content");
  }

  output.write("请使用手机微信扫码，并在手机上确认登录：\n\n");
  qrcode.generate(qrContent, { small: true }, (code) => output.write(`${code}\n`));
  output.write("二维码有效期通常约 5 分钟，等待确认中...\n");

  while (true) {
    const result = await client.pollLoginStatus(qrcodeId, config.longPollTimeoutMs);
    if (result.status === "created") {
      await store.save({
        ...state,
        token: result.token,
        accountId: result.accountId,
        userId: result.userId,
        baseUrl: normalizeBaseUrl(result.baseUrl || config.baseUrl),
      });
      output.write(`登录成功，账号 ${result.accountId || "(unknown)"} 已保存。\n`);
      return;
    }
    if (["expired", "denied", "error"].includes(result.status)) {
      throw new Error(result.message || `登录失败: ${result.qrStatus}`);
    }
    output.write(`扫码状态: ${result.qrStatus}\n`);
    await sleep(config.qrPollIntervalMs);
  }
}

async function listen({ config, store, once = false, signal } = {}) {
  let state = await store.load();
  ensureLoggedIn(state);
  const client = new WeixinClient({
    baseUrl: state.baseUrl || config.baseUrl,
    token: state.token,
    timeoutMs: config.apiTimeoutMs,
  });
  const media = createMediaService(config, client);

  output.write("开始长轮询接收消息。按 Ctrl+C 退出。\n");
  while (!signal?.aborted) {
    try {
      const data = await client.getUpdates(state.syncBuf, config.longPollTimeoutMs, signal);
      state = await applyUpdatesToState({
        data,
        state,
        store,
        onMessage: (summary) => output.write(formatInbound(summary)),
        resolveAttachments: (attachments) => media.downloadAttachments(attachments),
      });
      if (once) {
        return state;
      }
    } catch (error) {
      if (error?.name === "AbortError" && signal?.aborted) {
        return state;
      }
      if (error?.name === "AbortError") {
        continue;
      }
      if (error instanceof SessionTimeoutError) {
        throw error;
      }
      output.write(`接收失败，5 秒后重试: ${error.message}\n`);
      await sleep(5000);
    }
  }
  return state;
}

async function send({ config, store, toUserId, text }) {
  if (!toUserId || !text) {
    throw new Error("用法: npm run send -- <user_id> <text>");
  }
  const state = await store.load();
  ensureLoggedIn(state);
  const contextToken = state.contextTokens[toUserId];
  if (!contextToken) {
    throw new Error(`缺少 ${toUserId} 的 context_token。请先让对方给你发一条消息，并运行 listen/repl 接收。`);
  }
  const client = new WeixinClient({
    baseUrl: state.baseUrl || config.baseUrl,
    token: state.token,
    timeoutMs: config.apiTimeoutMs,
  });
  const response = await client.sendText({ toUserId, contextToken, text });
  if (!isSuccessfulPayload(response)) {
    throw createSendMessageError(response, toUserId);
  }
  output.write(`已发送给 ${toUserId}: ${text}\n`);
}

async function sendMedia({ config, store, type, toUserId, filePath }) {
  if (!toUserId || !filePath) {
    throw new Error(`用法: npm run ${`send-${type}`} -- <user_id> <file_path>`);
  }
  const state = await store.load();
  ensureLoggedIn(state);
  const contextToken = state.contextTokens[toUserId];
  if (!contextToken) {
    throw new Error(`缺少 ${toUserId} 的 context_token。请先让对方给你发一条消息，并运行 listen/repl 接收。`);
  }
  const client = new WeixinClient({
    baseUrl: state.baseUrl || config.baseUrl,
    token: state.token,
    timeoutMs: config.apiTimeoutMs,
  });
  const media = createMediaService(config, client);
  const method = {
    image: "buildImageItem",
    file: "buildFileItem",
    video: "buildVideoItem",
  }[type];
  const response = await client.sendItems({
    toUserId,
    contextToken,
    itemList: [await media[method](toUserId, filePath)],
  });
  if (!isSuccessfulPayload(response)) {
    throw createSendMessageError(response, toUserId);
  }
  output.write(`已发送 ${type} 给 ${toUserId}: ${filePath}\n`);
}

async function repl({ config, store }) {
  let closing = false;
  const controller = new AbortController();
  const receiveLoop = listen({ config, store, signal: controller.signal }).catch((error) => {
    if (!closing) {
      output.write(`接收循环退出: ${error.message}\n`);
    }
  });
  const rl = createInterface({ input, output, prompt: "weixin> " });
  output.write("命令: /send, /send-image, /send-file, /send-video, /sessions, /quit\n");
  rl.prompt();
  for await (const line of rl) {
    const trimmed = line.trim();
    try {
      if (trimmed === "/quit" || trimmed === "/exit") {
        closing = true;
        controller.abort();
        rl.close();
        break;
      } else if (trimmed === "/sessions") {
        await printSessions(store);
      } else if (/^\/send-(image|file|video)\s/u.test(trimmed)) {
        const [command, toUserId, filePath] = trimmed.split(/\s+/u);
        await sendMedia({ config, store, type: command.slice(6), toUserId, filePath });
      } else if (trimmed.startsWith("/send ")) {
        const [, toUserId, ...textParts] = trimmed.split(/\s+/u);
        await send({ config, store, toUserId, text: textParts.join(" ") });
      } else if (trimmed) {
        output.write("未知命令，请使用 /send、/send-image、/send-file、/send-video、/sessions 或 /quit。\n");
      }
    } catch (error) {
      output.write(`${error.message}\n`);
    }
    rl.prompt();
  }
  await Promise.race([receiveLoop, sleep(100)]);
}

async function printSessions(store) {
  const state = await store.load();
  const ids = Object.keys(state.sessions);
  if (!ids.length) {
    output.write("暂无会话。先运行 listen/repl 接收一条消息。\n");
    return;
  }
  for (const id of ids) {
    const session = state.sessions[id] || {};
    output.write(`${id}  ${session.lastText || ""}\n`);
  }
}

function ensureLoggedIn(state) {
  if (!state.token) {
    throw new Error("尚未登录，请先执行 npm run login");
  }
}

function formatInbound(summary) {
  const text = summary.text || extractPlainText(summary.raw?.item_list) || "[非文本消息]";
  const attachments = summary.attachments
    .map((item) => item.filePath ? `\n  [${item.type}] ${item.filePath}` : `\n  [${item.type}] 下载失败: ${item.error}`)
    .join("");
  return `[${new Date().toLocaleString()}] ${summary.fromUserId}: ${text}${attachments}\n`;
}

function createMediaService(config, client) {
  return new MediaService({
    client,
    cdnClient: new CdnClient({
      baseUrl: config.cdnBaseUrl,
      timeoutMs: config.apiTimeoutMs,
    }),
    mediaDir: config.mediaDir,
  });
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
