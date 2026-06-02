import { describe, expect, it, vi } from "vitest";

import { CdnClient } from "../src/cdn-client.js";

describe("CdnClient", () => {
  it("uploads ciphertext to upload_full_url and returns the CDN download param", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("", { status: 200, headers: { "x-encrypted-param": "download-param" } }),
    );
    const client = new CdnClient({ fetchImpl });

    await expect(client.upload({
      ciphertext: Buffer.from("encrypted"),
      filekey: "file-key",
      uploadFullUrl: "https://cdn.example/upload/full",
    })).resolves.toBe("download-param");

    expect(String(fetchImpl.mock.calls[0][0])).toBe("https://cdn.example/upload/full");
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: "POST" });
  });

  it("downloads ciphertext using the CDN reference", async () => {
    const fetchImpl = vi.fn(async () => new Response(Buffer.from("encrypted")));
    const client = new CdnClient({ baseUrl: "https://cdn.example/c2c", fetchImpl });

    await expect(client.download({ encrypt_query_param: "download-param" }))
      .resolves.toEqual(Buffer.from("encrypted"));
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      "https://cdn.example/c2c/download?encrypted_query_param=download-param",
    );
  });
});
