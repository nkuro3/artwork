import { describe, expect, it } from "vitest";

import {
  createStorageClient,
  generateR2Key,
  type StorageConfig,
} from "./storage";

// ダミーの鍵（ネットワークには出ない / 署名の構造のみ検証する）。
const CONFIG: StorageConfig = {
  accountId: "acct123",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "secretExampleKey0000000000000000000000000",
  bucketName: "artwork-bucket",
};

const HOST = `${CONFIG.accountId}.r2.cloudflarestorage.com`;

describe("createStorageClient.objectEndpoint", () => {
  it("builds the unsigned S3 object URL for a key", () => {
    const client = createStorageClient(CONFIG);
    expect(client.objectEndpoint("artworks/abc.jpg")).toBe(
      `https://${HOST}/${CONFIG.bucketName}/artworks/abc.jpg`,
    );
  });

  it("normalizes a leading slash on the key (no double slash)", () => {
    const client = createStorageClient(CONFIG);
    expect(client.objectEndpoint("/artworks/abc.jpg")).toBe(
      `https://${HOST}/${CONFIG.bucketName}/artworks/abc.jpg`,
    );
  });
});

describe("createStorageClient.presignPutUrl", () => {
  it("returns a presigned URL based on the object endpoint", async () => {
    const client = createStorageClient(CONFIG);
    const url = await client.presignPutUrl("artworks/abc.jpg");
    expect(url.startsWith(`https://${HOST}/${CONFIG.bucketName}/artworks/abc.jpg?`)).toBe(true);
  });

  it("includes the SigV4 query parameters", async () => {
    const client = createStorageClient(CONFIG);
    const url = await client.presignPutUrl("artworks/abc.jpg");
    const params = new URL(url).searchParams;
    expect(params.get("X-Amz-Signature")).toBeTruthy();
    expect(params.get("X-Amz-Credential")).toBeTruthy();
    expect(params.get("X-Amz-Expires")).toBeTruthy();
    expect(params.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
  });

  it("embeds the accessKeyId in X-Amz-Credential", async () => {
    const client = createStorageClient(CONFIG);
    const url = await client.presignPutUrl("artworks/abc.jpg");
    const credential = new URL(url).searchParams.get("X-Amz-Credential");
    expect(credential).toContain(CONFIG.accessKeyId);
  });

  it("reflects expiresIn in X-Amz-Expires", async () => {
    const client = createStorageClient(CONFIG);
    const url = await client.presignPutUrl("artworks/abc.jpg", { expiresIn: 120 });
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("120");
  });

  it("uses a short default expiry when expiresIn is omitted", async () => {
    const client = createStorageClient(CONFIG);
    const url = await client.presignPutUrl("artworks/abc.jpg");
    const expires = Number(new URL(url).searchParams.get("X-Amz-Expires"));
    expect(expires).toBeGreaterThan(0);
    expect(expires).toBeLessThanOrEqual(600);
  });

  it("scopes the signature to the key (different key => different path)", async () => {
    const client = createStorageClient(CONFIG);
    const a = await client.presignPutUrl("artworks/a.jpg");
    const b = await client.presignPutUrl("artworks/b.jpg");
    expect(new URL(a).pathname).toBe(`/${CONFIG.bucketName}/artworks/a.jpg`);
    expect(new URL(b).pathname).toBe(`/${CONFIG.bucketName}/artworks/b.jpg`);
    expect(new URL(a).pathname).not.toBe(new URL(b).pathname);
  });

  it("includes the content type in signed headers when provided", async () => {
    const client = createStorageClient(CONFIG);
    const url = await client.presignPutUrl("artworks/abc.jpg", {
      contentType: "image/png",
    });
    expect(new URL(url).searchParams.get("X-Amz-SignedHeaders")).toContain(
      "content-type",
    );
  });
});

describe("generateR2Key", () => {
  it("is deterministic for the same randomId", () => {
    const opts = { prefix: "artworks", ext: "jpg", randomId: "id-1" };
    expect(generateR2Key(opts)).toBe(generateR2Key(opts));
  });

  it("applies prefix and ext", () => {
    expect(generateR2Key({ prefix: "artworks", ext: "jpg", randomId: "id-1" })).toBe(
      "artworks/id-1.jpg",
    );
  });

  it("omits the prefix segment when no prefix is given", () => {
    expect(generateR2Key({ ext: "png", randomId: "id-1" })).toBe("id-1.png");
  });

  it("omits the extension when no ext is given", () => {
    expect(generateR2Key({ prefix: "artworks", randomId: "id-1" })).toBe(
      "artworks/id-1",
    );
  });

  it("does not produce a leading slash", () => {
    expect(generateR2Key({ prefix: "/artworks", ext: "jpg", randomId: "id-1" })).not.toMatch(
      /^\//,
    );
  });

  it("normalizes an ext with a leading dot", () => {
    expect(generateR2Key({ prefix: "artworks", ext: ".JPG", randomId: "id-1" })).toBe(
      "artworks/id-1.jpg",
    );
  });

  it("produces a key without unsafe characters", () => {
    const key = generateR2Key({ prefix: "artworks", ext: "jpg", randomId: "id-1" });
    expect(key).toMatch(/^[A-Za-z0-9/_.-]+$/);
  });
});
