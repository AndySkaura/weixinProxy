import { describe, expect, it } from "vitest";

import { DEFAULT_BASE_URL, normalizeBaseUrl } from "../src/config.js";

describe("normalizeBaseUrl", () => {
  it("uses the default URL when value is blank", () => {
    expect(normalizeBaseUrl("")).toBe(DEFAULT_BASE_URL);
    expect(normalizeBaseUrl(undefined)).toBe(DEFAULT_BASE_URL);
  });

  it("trims whitespace and trailing slashes", () => {
    expect(normalizeBaseUrl(" https://ilinkai.weixin.qq.com/// ")).toBe(
      "https://ilinkai.weixin.qq.com",
    );
  });
});
