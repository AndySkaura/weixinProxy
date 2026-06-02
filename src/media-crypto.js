import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export function randomAesKey() {
  return randomBytes(16);
}

export function encryptAesEcb(plaintext, key) {
  assertAesKey(key);
  const cipher = createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

export function decryptAesEcb(ciphertext, key) {
  assertAesKey(key);
  const decipher = createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function md5Hex(content) {
  return createHash("md5").update(content).digest("hex");
}

export function encodeOutboundAesKey(key) {
  assertAesKey(key);
  return Buffer.from(key.toString("hex"), "utf8").toString("base64");
}

export function decodeMediaAesKey(value) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error("媒体缺少 AES key");
  }
  if (/^[0-9a-f]{32}$/iu.test(text)) {
    return Buffer.from(text, "hex");
  }
  const decoded = Buffer.from(text, "base64");
  if (decoded.length === 16) {
    return decoded;
  }
  const hex = decoded.toString("utf8");
  if (/^[0-9a-f]{32}$/iu.test(hex)) {
    return Buffer.from(hex, "hex");
  }
  throw new Error("媒体 AES key 格式不受支持");
}

function assertAesKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 16) {
    throw new Error("AES-128 key 必须是 16 字节 Buffer");
  }
}
