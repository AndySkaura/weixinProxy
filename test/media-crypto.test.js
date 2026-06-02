import { describe, expect, it } from "vitest";

import {
  decodeMediaAesKey,
  decryptAesEcb,
  encodeOutboundAesKey,
  encryptAesEcb,
  md5Hex,
} from "../src/media-crypto.js";

describe("media crypto", () => {
  const key = Buffer.from("00112233445566778899aabbccddeeff", "hex");

  it("round trips AES-128-ECB encrypted content", () => {
    const plaintext = Buffer.from("hello ilink media");
    expect(decryptAesEcb(encryptAesEcb(plaintext, key), key)).toEqual(plaintext);
    expect(md5Hex(plaintext)).toBe("3bc0f3a4922890c6db25885477d30f46");
  });

  it("decodes raw base64, hex, and base64 encoded hex keys", () => {
    expect(decodeMediaAesKey(key.toString("base64"))).toEqual(key);
    expect(decodeMediaAesKey(key.toString("hex"))).toEqual(key);
    expect(decodeMediaAesKey(encodeOutboundAesKey(key))).toEqual(key);
  });
});
