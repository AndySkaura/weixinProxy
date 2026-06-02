import { join } from "node:path";

export const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export const DEFAULT_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
export const DEFAULT_BOT_TYPE = "3";
export const DEFAULT_QR_POLL_INTERVAL_MS = 1000;
export const DEFAULT_LONG_POLL_TIMEOUT_MS = 35000;
export const DEFAULT_API_TIMEOUT_MS = 15000;
export const DEFAULT_STATE_PATH = join(process.cwd(), ".weixin-proxy", "state.json");
export const DEFAULT_MEDIA_DIR = join(process.cwd(), ".weixin-proxy", "media");

export function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/u, "");
}

export function intFromEnv(name, fallback, minimum = 1) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  if (Number.isFinite(parsed)) {
    return Math.max(parsed, minimum);
  }
  return fallback;
}

export function loadRuntimeConfig() {
  return {
    baseUrl: normalizeBaseUrl(process.env.WEIXIN_OC_BASE_URL),
    botType: process.env.WEIXIN_OC_BOT_TYPE || DEFAULT_BOT_TYPE,
    statePath: process.env.WEIXIN_PROXY_STATE || DEFAULT_STATE_PATH,
    cdnBaseUrl: normalizeBaseUrl(process.env.WEIXIN_OC_CDN_BASE_URL || DEFAULT_CDN_BASE_URL),
    mediaDir: process.env.WEIXIN_PROXY_MEDIA_DIR || DEFAULT_MEDIA_DIR,
    qrPollIntervalMs: intFromEnv(
      "WEIXIN_OC_QR_POLL_INTERVAL_MS",
      DEFAULT_QR_POLL_INTERVAL_MS,
      250,
    ),
    longPollTimeoutMs: intFromEnv(
      "WEIXIN_OC_LONG_POLL_TIMEOUT_MS",
      DEFAULT_LONG_POLL_TIMEOUT_MS,
      1000,
    ),
    apiTimeoutMs: intFromEnv("WEIXIN_OC_API_TIMEOUT_MS", DEFAULT_API_TIMEOUT_MS, 1000),
  };
}
