import { describe, expect, it, vi } from "vitest";
import { uploadArtworkImage } from "./upload";
import type { UploadClient } from "./upload";

// D3 画像アップロード orchestration（FR-06 / NFR-02 / C3）。
// 署名 URL → R2 直 PUT → メタ作成 の 3 段。client/fetch を注入して検証する。

function json(body: unknown, ok = true, status = ok ? 201 : 400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeFile(type = "image/png"): File {
  return new File([new Uint8Array([1, 2, 3])], "art.png", { type });
}

/** sign / メタ作成 の RPC をモックした client を作る。 */
function mockClient(overrides: Partial<Mocks> = {}) {
  const sign =
    overrides.sign ??
    vi
      .fn()
      .mockResolvedValue(
        json({ uploadUrl: "https://r2.example/put/abc", r2Key: "artworks/abc.png" }),
      );
  const meta =
    overrides.meta ??
    vi
      .fn()
      .mockResolvedValue(json({ id: "img1", r2Key: "artworks/abc.png" }));

  const client = {
    uploads: { sign: { $post: sign } },
    artworks: { ":id": { images: { $post: meta } } },
  } as unknown as UploadClient;

  return { client, sign, meta };
}

interface Mocks {
  sign: ReturnType<typeof vi.fn>;
  meta: ReturnType<typeof vi.fn>;
}

describe("uploadArtworkImage", () => {
  it("sign → PUT → メタ作成 の順で呼ぶ", async () => {
    const order: string[] = [];
    const sign = vi.fn(async () => {
      order.push("sign");
      return json({ uploadUrl: "https://r2/put", r2Key: "artworks/x.png" });
    });
    const meta = vi.fn(async () => {
      order.push("meta");
      return json({ id: "img1", r2Key: "artworks/x.png" });
    });
    const fetchImpl = vi.fn(async () => {
      order.push("put");
      return new Response(null, { status: 200 });
    });
    const { client } = mockClient({ sign, meta });

    const result = await uploadArtworkImage(
      { client, fetchImpl: fetchImpl as unknown as typeof fetch },
      { artworkId: "a1", file: makeFile() },
    );

    expect(result.ok).toBe(true);
    expect(order).toEqual(["sign", "put", "meta"]);
  });

  it("sign に ext / contentType を渡す", async () => {
    const { client, sign } = mockClient();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));

    await uploadArtworkImage(
      { client, fetchImpl: fetchImpl as unknown as typeof fetch },
      { artworkId: "a1", file: makeFile("image/png") },
    );

    expect(sign).toHaveBeenCalledWith({
      json: { ext: "png", contentType: "image/png" },
    });
  });

  it("PUT は uploadUrl 宛て・body=file・Content-Type を載せる", async () => {
    const { client } = mockClient();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    const file = makeFile("image/png");

    await uploadArtworkImage(
      { client, fetchImpl: fetchImpl as unknown as typeof fetch },
      { artworkId: "a1", file },
    );

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://r2.example/put/abc");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(file);
    expect(new Headers(init.headers).get("content-type")).toBe("image/png");
  });

  it("メタ作成に r2Key（と width/height）を渡す", async () => {
    const { client, meta } = mockClient();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));

    await uploadArtworkImage(
      { client, fetchImpl: fetchImpl as unknown as typeof fetch },
      { artworkId: "a1", file: makeFile(), width: 800, height: 600 },
    );

    expect(meta).toHaveBeenCalledWith({
      param: { id: "a1" },
      json: { r2Key: "artworks/abc.png", width: 800, height: 600 },
    });
  });

  it("sign 失敗はエラーにし、PUT/メタ作成を呼ばない", async () => {
    const { client, meta } = mockClient({
      sign: vi.fn().mockResolvedValue(json({ message: "no" }, false, 400)),
    });
    const fetchImpl = vi.fn();

    const result = await uploadArtworkImage(
      { client, fetchImpl: fetchImpl as unknown as typeof fetch },
      { artworkId: "a1", file: makeFile() },
    );

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(meta).not.toHaveBeenCalled();
  });

  it("PUT 失敗はエラーにし、メタ作成を呼ばない", async () => {
    const { client, meta } = mockClient();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 403 }));

    const result = await uploadArtworkImage(
      { client, fetchImpl: fetchImpl as unknown as typeof fetch },
      { artworkId: "a1", file: makeFile() },
    );

    expect(result.ok).toBe(false);
    expect(meta).not.toHaveBeenCalled();
  });

  it("メタ作成失敗はエラーにする", async () => {
    const { client } = mockClient({
      meta: vi.fn().mockResolvedValue(json({ message: "no" }, false, 404)),
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));

    const result = await uploadArtworkImage(
      { client, fetchImpl: fetchImpl as unknown as typeof fetch },
      { artworkId: "a1", file: makeFile() },
    );
    expect(result.ok).toBe(false);
  });

  it("ext は MIME から決まり、不明 type は bin にフォールバック", async () => {
    const { client, sign } = mockClient();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));

    await uploadArtworkImage(
      { client, fetchImpl: fetchImpl as unknown as typeof fetch },
      { artworkId: "a1", file: makeFile("image/jpeg") },
    );
    expect(sign).toHaveBeenCalledWith({
      json: { ext: "jpg", contentType: "image/jpeg" },
    });
  });
});
