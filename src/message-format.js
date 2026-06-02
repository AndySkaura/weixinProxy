import { extractMediaAttachments } from "./media.js";

export const CHANNEL_VERSION = "weixin-proxy-ilink";

export function buildTextItem(text) {
  return {
    type: 1,
    text_item: {
      text: String(text),
    },
  };
}

export function extractPlainText(itemList = []) {
  const parts = [];
  for (const item of Array.isArray(itemList) ? itemList : []) {
    if (Number(item?.type || 0) !== 1) {
      continue;
    }
    const text = String(item?.text_item?.text || "").trim();
    if (text) {
      parts.push(text);
    }
  }
  return parts.join(" ");
}

export function buildSendMessagePayload({ toUserId, contextToken, text, itemList, clientId }) {
  return {
    base_info: {
      channel_version: CHANNEL_VERSION,
    },
    msg: {
      from_user_id: "",
      to_user_id: toUserId,
      client_id: clientId,
      message_type: 2,
      message_state: 2,
      context_token: contextToken,
      item_list: itemList || [buildTextItem(text)],
    },
  };
}

export function summarizeInboundMessage(message) {
  const fromUserId = String(message?.from_user_id || "").trim();
  const contextToken = String(message?.context_token || "").trim();
  const text = extractPlainText(message?.item_list || []);
  const messageId = String(message?.message_id || message?.msg_id || "").trim();
  const createTime = message?.create_time_ms || message?.create_time || Date.now();
  const attachments = extractMediaAttachments(message?.item_list);
  return {
    fromUserId,
    contextToken,
    text,
    messageId,
    createTime,
    attachments,
    raw: message,
  };
}
