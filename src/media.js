import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import { DEFAULT_MEDIA_DIR } from "./config.js";
import {
  decodeMediaAesKey,
  decryptAesEcb,
  encodeOutboundAesKey,
  encryptAesEcb,
  md5Hex,
  randomAesKey,
} from "./media-crypto.js";

export const UPLOAD_MEDIA_TYPE = { image: 1, video: 2, file: 3 };
export const MESSAGE_ITEM_TYPE = { image: 2, file: 4, video: 5 };

export class MediaService {
  constructor({ client, cdnClient, mediaDir = DEFAULT_MEDIA_DIR }) {
    this.client = client;
    this.cdnClient = cdnClient;
    this.mediaDir = mediaDir;
  }

  async buildImageItem(toUserId, filePath, options = {}) {
    const uploaded = await this.upload(toUserId, "image", filePath, options.thumbnailPath);
    return {
      type: MESSAGE_ITEM_TYPE.image,
      image_item: {
        media: uploaded.media,
        aeskey: uploaded.aesKey.toString("hex"),
        mid_size: uploaded.ciphertextSize,
        hd_size: uploaded.ciphertextSize,
        ...thumbFields(uploaded.thumbnail, options),
      },
    };
  }

  async buildFileItem(toUserId, filePath) {
    const uploaded = await this.upload(toUserId, "file", filePath);
    return {
      type: MESSAGE_ITEM_TYPE.file,
      file_item: {
        media: uploaded.media,
        file_name: basename(filePath),
        md5: uploaded.md5,
        len: String(uploaded.plaintextSize),
      },
    };
  }

  async buildVideoItem(toUserId, filePath, options = {}) {
    const uploaded = await this.upload(toUserId, "video", filePath, options.thumbnailPath);
    return {
      type: MESSAGE_ITEM_TYPE.video,
      video_item: {
        media: uploaded.media,
        video_size: uploaded.ciphertextSize,
        video_md5: uploaded.md5,
        play_length: Number(options.playLengthMs || 0),
        ...thumbFields(uploaded.thumbnail, options),
      },
    };
  }

  async upload(toUserId, type, filePath, thumbnailPath) {
    const filekey = randomBytes(16).toString("hex");
    const prepared = await prepareUpload(filePath);
    const thumbnail = thumbnailPath ? await prepareUpload(thumbnailPath, prepared.aesKey) : null;
    const response = await this.client.getUploadUrl({
      filekey,
      mediaType: UPLOAD_MEDIA_TYPE[type],
      toUserId,
      rawsize: prepared.plaintextSize,
      rawfilemd5: prepared.md5,
      filesize: prepared.ciphertextSize,
      noNeedThumb: !thumbnail,
      aeskey: prepared.aesKey.toString("hex"),
      thumbRawsize: thumbnail?.plaintextSize,
      thumbRawfilemd5: thumbnail?.md5,
      thumbFilesize: thumbnail?.ciphertextSize,
    });
    if (Number(response?.ret ?? 0) !== 0) {
      throw new Error(response?.errmsg || `getuploadurl returned ret=${response?.ret}`);
    }
    const encryptedParam = await this.cdnClient.upload({
      ciphertext: prepared.ciphertext,
      filekey,
      uploadParam: response.upload_param,
      uploadFullUrl: response.upload_full_url,
    });
    prepared.media = buildCdnMedia(encryptedParam, prepared.aesKey);
    if (thumbnail) {
      const thumbEncryptedParam = await this.cdnClient.upload({
        ciphertext: thumbnail.ciphertext,
        filekey,
        uploadParam: response.thumb_upload_param,
      });
      thumbnail.media = buildCdnMedia(thumbEncryptedParam, thumbnail.aesKey);
    }
    return { ...prepared, thumbnail };
  }

  async downloadAttachments(attachments) {
    return Promise.all(attachments.map(async (attachment) => {
      try {
        return await this.downloadAttachment(attachment);
      } catch (error) {
        return { ...attachment, error: error.message };
      }
    }));
  }

  async downloadAttachment(attachment) {
    const ciphertext = await this.cdnClient.download(attachment.media);
    const key = decodeMediaAesKey(attachment.aesKey);
    const plaintext = decryptAesEcb(ciphertext, key);
    await mkdir(this.mediaDir, { recursive: true });
    const fileName = `${Date.now()}-${randomBytes(4).toString("hex")}-${safeName(attachment.fileName)}`;
    const filePath = join(this.mediaDir, fileName);
    await writeFile(filePath, plaintext, { mode: 0o600 });
    return { ...attachment, filePath, size: plaintext.length };
  }
}

export function extractMediaAttachments(itemList = []) {
  const attachments = [];
  for (const item of Array.isArray(itemList) ? itemList : []) {
    if (Number(item?.type) === MESSAGE_ITEM_TYPE.image && item.image_item?.media) {
      attachments.push(describeAttachment("image", item.image_item.media, {
        aesKey: item.image_item.aeskey || item.image_item.media.aes_key,
        fileName: `image-${item.msg_id || "received"}.jpg`,
      }));
    }
    if (Number(item?.type) === MESSAGE_ITEM_TYPE.file && item.file_item?.media) {
      attachments.push(describeAttachment("file", item.file_item.media, {
        aesKey: item.file_item.media.aes_key,
        fileName: item.file_item.file_name || "attachment.bin",
      }));
    }
    if (Number(item?.type) === MESSAGE_ITEM_TYPE.video && item.video_item?.media) {
      attachments.push(describeAttachment("video", item.video_item.media, {
        aesKey: item.video_item.media.aes_key,
        fileName: `video-${item.msg_id || "received"}.mp4`,
      }));
    }
  }
  return attachments;
}

async function prepareUpload(filePath, aesKey = randomAesKey()) {
  const plaintext = await readFile(filePath);
  const ciphertext = encryptAesEcb(plaintext, aesKey);
  return {
    aesKey,
    ciphertext,
    ciphertextSize: ciphertext.length,
    md5: md5Hex(plaintext),
    plaintextSize: plaintext.length,
  };
}

function buildCdnMedia(encryptedParam, aesKey) {
  return {
    encrypt_query_param: encryptedParam,
    aes_key: encodeOutboundAesKey(aesKey),
    encrypt_type: 1,
  };
}

function thumbFields(thumbnail, options) {
  if (!thumbnail) {
    return {};
  }
  return {
    thumb_media: thumbnail.media,
    thumb_size: thumbnail.ciphertextSize,
    thumb_width: Number(options.thumbnailWidth || 0),
    thumb_height: Number(options.thumbnailHeight || 0),
  };
}

function describeAttachment(type, media, options) {
  return { type, media, ...options };
}

function safeName(fileName) {
  const name = basename(String(fileName || "attachment.bin")).replace(/[^\w.-]+/gu, "_");
  return name || `attachment${extname(String(fileName || "")) || ".bin"}`;
}
