import { DEFAULT_API_TIMEOUT_MS, DEFAULT_CDN_BASE_URL, normalizeBaseUrl } from "./config.js";

export class CdnClient {
  constructor({
    baseUrl = DEFAULT_CDN_BASE_URL,
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    fetchImpl = fetch,
  } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  async upload({ ciphertext, filekey, uploadParam, uploadFullUrl }) {
    const url = uploadFullUrl || this.uploadUrl(uploadParam, filekey);
    const response = await this.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: ciphertext,
    });
    const encryptedParam = response.headers.get("x-encrypted-param");
    if (!encryptedParam) {
      throw new Error("CDN 上传成功但未返回 x-encrypted-param");
    }
    return encryptedParam;
  }

  async download(media) {
    const encryptedParam = stringValue(media?.encrypt_query_param);
    const url = stringValue(media?.full_url) || this.downloadUrl(encryptedParam);
    const response = await this.request(url);
    return Buffer.from(await response.arrayBuffer());
  }

  uploadUrl(uploadParam, filekey) {
    if (!uploadParam || !filekey) {
      throw new Error("CDN 上传缺少 upload_param 或 filekey");
    }
    const url = new URL(`${this.baseUrl}/upload`);
    url.searchParams.set("encrypted_query_param", uploadParam);
    url.searchParams.set("filekey", filekey);
    return url;
  }

  downloadUrl(encryptedParam) {
    if (!encryptedParam) {
      throw new Error("CDN 下载缺少 encrypt_query_param");
    }
    const url = new URL(`${this.baseUrl}/download`);
    url.searchParams.set("encrypted_query_param", encryptedParam);
    return url;
  }

  async request(url, init = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`CDN 请求失败: ${response.status} ${await response.text()}`);
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}
