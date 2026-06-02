import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { MediaService, extractMediaAttachments } from "../src/media.js";
import { encodeOutboundAesKey, encryptAesEcb } from "../src/media-crypto.js";

const tempDirs = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "weixin-media-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("MediaService", () => {
  it("uploads a file and builds a file message item", async () => {
    const dir = await makeTempDir();
    const filePath = join(dir, "report.pdf");
    await writeFile(filePath, "report");
    const client = { getUploadUrl: vi.fn(async () => ({ upload_full_url: "https://cdn/upload" })) };
    const cdnClient = { upload: vi.fn(async () => "download-param") };
    const media = new MediaService({ client, cdnClient, mediaDir: dir });

    const item = await media.buildFileItem("peer", filePath);

    expect(client.getUploadUrl).toHaveBeenCalledWith(expect.objectContaining({
      mediaType: 3,
      toUserId: "peer",
      noNeedThumb: true,
    }));
    expect(item).toMatchObject({
      type: 4,
      file_item: {
        file_name: "report.pdf",
        len: "6",
        media: { encrypt_query_param: "download-param", encrypt_type: 1 },
      },
    });
  });

  it("downloads and decrypts inbound attachments", async () => {
    const dir = await makeTempDir();
    const key = Buffer.from("00112233445566778899aabbccddeeff", "hex");
    const plaintext = Buffer.from("received file");
    const cdnClient = { download: vi.fn(async () => encryptAesEcb(plaintext, key)) };
    const media = new MediaService({ client: {}, cdnClient, mediaDir: dir });

    const [attachment] = await media.downloadAttachments([{
      type: "file",
      fileName: "note.txt",
      aesKey: encodeOutboundAesKey(key),
      media: { encrypt_query_param: "param" },
    }]);

    expect(await readFile(attachment.filePath)).toEqual(plaintext);
  });
});

describe("extractMediaAttachments", () => {
  it("extracts image, file, and video CDN references", () => {
    expect(extractMediaAttachments([
      { type: 2, image_item: { aeskey: "hex", media: { encrypt_query_param: "image" } } },
      { type: 4, file_item: { file_name: "a.pdf", media: { encrypt_query_param: "file", aes_key: "key" } } },
      { type: 5, video_item: { media: { encrypt_query_param: "video", aes_key: "key" } } },
    ])).toMatchObject([
      { type: "image", aesKey: "hex" },
      { type: "file", fileName: "a.pdf" },
      { type: "video" },
    ]);
  });
});
