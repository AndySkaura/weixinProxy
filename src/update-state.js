import { summarizeInboundMessage } from "./message-format.js";
import { SESSION_TIMEOUT_ERRCODE } from "./weixin-client.js";

export class SessionTimeoutError extends Error {
  constructor(message = "微信登录态已失效，请重新执行 npm run login") {
    super(message);
    this.name = "SessionTimeoutError";
  }
}

export async function applyUpdatesToState({
  data,
  state,
  store,
  now = Date.now,
  onMessage = () => {},
  resolveAttachments = async (attachments) => attachments,
}) {
  if (!isSuccessfulPayload(data)) {
    if (Number(data?.errcode) === SESSION_TIMEOUT_ERRCODE) {
      const next = { ...state, token: "", syncBuf: "", contextTokens: {} };
      await store.save(next);
      throw new SessionTimeoutError();
    }
    throw new Error(data?.errmsg || `getupdates returned ret=${data?.ret}`);
  }

  const next = {
    ...state,
    syncBuf: stringValue(data?.get_updates_buf) || state.syncBuf,
    contextTokens: { ...state.contextTokens },
    sessions: { ...state.sessions },
  };

  for (const message of Array.isArray(data?.msgs) ? data.msgs : []) {
    const summary = summarizeInboundMessage(message);
    if (!summary.fromUserId) {
      continue;
    }
    if (summary.contextToken) {
      next.contextTokens[summary.fromUserId] = summary.contextToken;
    }
    summary.attachments = await resolveAttachments(summary.attachments);
    next.sessions[summary.fromUserId] = {
      lastText: summary.text || attachmentSummary(summary.attachments),
      messageId: summary.messageId,
      updatedAt: now(),
    };
    onMessage(summary);
  }

  await store.save(next);
  return next;
}

function attachmentSummary(attachments) {
  return attachments.length ? `[${attachments.map((item) => item.type).join(", ")}]` : "";
}

export function isSuccessfulPayload(data) {
  return Number(data?.ret ?? 0) === 0;
}

export function createSendMessageError(data, toUserId = "该联系人") {
  if (Number(data?.ret) === -2) {
    return new Error(
      `发送失败：${toUserId} 的 context_token 已失效。请让对方重新给 Bot 发送一条消息，待 listen/repl 接收后再重试。`,
    );
  }
  return new Error(data?.errmsg || `sendmessage returned ret=${data?.ret}`);
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}
