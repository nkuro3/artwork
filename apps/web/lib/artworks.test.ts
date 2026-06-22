import { describe, expect, it, vi } from "vitest";
import {
  createArtwork,
  deleteArtwork,
  getArtwork,
  listArtworks,
  updateArtwork,
} from "./artworks";
import type { ArtworksClient } from "./artworks";

// D3 作品管理コア（FR-05）。api クライアントを注入し、RPC を呼んで結果を正規化する。
// next 非依存・純ロジック。クライアントはモックして RPC 呼び出しと正規化を検証する。

/** Response 風オブジェクト（hono RPC の $get/$post 等の戻りに合わせた最小形）。 */
function res(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SAMPLE = {
  id: "a1",
  userId: "u1",
  artistProfileId: "p1",
  title: "夜",
  description: null,
  status: "draft",
  isPublic: false,
  sortOrder: 0,
  thumbnailUrl: "https://img.example/artworks/a1.jpg/thumb",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

/** artworks コアが使う RPC 部分集合のモックを作る。 */
function mockClient(overrides: Partial<MockShape> = {}) {
  const list = vi.fn().mockResolvedValue(res([SAMPLE]));
  const post = vi.fn().mockResolvedValue(res(SAMPLE, true, 201));
  const patch = vi.fn().mockResolvedValue(res({ ...SAMPLE, title: "朝" }));
  const del = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

  const get = vi.fn().mockResolvedValue(res(SAMPLE));

  const client = {
    // E0: 全 api ルートを /api 配下へ寄せたため、hc のアクセスは client.api.* になる（ADR D4）。
    api: {
      artworks: Object.assign(
        {
          $get: overrides.list ?? list,
          $post: overrides.post ?? post,
        },
        {
          ":id": {
            $get: overrides.get ?? get,
            $patch: overrides.patch ?? patch,
            $delete: overrides.del ?? del,
          },
        },
      ),
    },
  } as unknown as ArtworksClient;

  return { client, list, post, patch, del, get };
}

interface MockShape {
  list: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
}

describe("getArtwork", () => {
  it("id を param に渡し、作品を返す", async () => {
    const { client, get } = mockClient();
    const result = await getArtwork(client, "a1");

    expect(get).toHaveBeenCalledWith({ param: { id: "a1" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe("a1");
  });

  it("404 は失敗に正規化する", async () => {
    const { client } = mockClient({
      get: vi.fn().mockResolvedValue(res({ message: "Not Found" }, false, 404)),
    });
    const result = await getArtwork(client, "missing");
    expect(result.ok).toBe(false);
  });
});

describe("listArtworks", () => {
  it("RPC を呼び、成功時に作品配列を返す", async () => {
    const { client, list } = mockClient();
    const result = await listArtworks(client);

    expect(list).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe("a1");
      expect(result.data[0]?.thumbnailUrl).toBe(
        "https://img.example/artworks/a1.jpg/thumb",
      );
    }
  });

  it("画像なしの作品は thumbnailUrl=null を保持する", async () => {
    const { client } = mockClient({
      list: vi.fn().mockResolvedValue(res([{ ...SAMPLE, thumbnailUrl: null }])),
    });
    const result = await listArtworks(client);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0]?.thumbnailUrl).toBeNull();
  });

  it("非 ok レスポンスは失敗に正規化する", async () => {
    const { client } = mockClient({
      list: vi.fn().mockResolvedValue(res({ message: "boom" }, false, 500)),
    });
    const result = await listArtworks(client);
    expect(result.ok).toBe(false);
  });
});

describe("createArtwork", () => {
  it("title をトリムして RPC に渡し、作成結果を返す", async () => {
    const { client, post } = mockClient();
    const result = await createArtwork(client, { title: "  夜  " });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({ json: { title: "夜" } });
    expect(result.ok).toBe(true);
  });

  it("description / status / isPublic を指定すれば json に載せる", async () => {
    const { client, post } = mockClient();
    await createArtwork(client, {
      title: "夜",
      description: "説明",
      status: "published",
      isPublic: true,
    });
    expect(post).toHaveBeenCalledWith({
      json: {
        title: "夜",
        description: "説明",
        status: "published",
        isPublic: true,
      },
    });
  });

  it("title 空はバリデーションエラー（RPC を呼ばない）", async () => {
    const { client, post } = mockClient();
    const result = await createArtwork(client, { title: "   " });

    expect(post).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/title/i);
  });

  it("非 ok レスポンスは失敗に正規化する", async () => {
    const { client } = mockClient({
      post: vi.fn().mockResolvedValue(res({ message: "bad" }, false, 400)),
    });
    const result = await createArtwork(client, { title: "夜" });
    expect(result.ok).toBe(false);
  });
});

describe("updateArtwork", () => {
  it("id を param に、patch を json に渡す", async () => {
    const { client, patch } = mockClient();
    const result = await updateArtwork(client, "a1", { title: "朝" });

    expect(patch).toHaveBeenCalledWith({
      param: { id: "a1" },
      json: { title: "朝" },
    });
    expect(result.ok).toBe(true);
  });

  it("title を指定した場合は空文字を弾く", async () => {
    const { client, patch } = mockClient();
    const result = await updateArtwork(client, "a1", { title: "  " });

    expect(patch).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it("title 未指定の部分更新は許可する", async () => {
    const { client, patch } = mockClient();
    const result = await updateArtwork(client, "a1", { isPublic: true });

    expect(patch).toHaveBeenCalledWith({
      param: { id: "a1" },
      json: { isPublic: true },
    });
    expect(result.ok).toBe(true);
  });
});

describe("deleteArtwork", () => {
  it("id を param に渡し、204 を成功に正規化する", async () => {
    const { client, del } = mockClient();
    const result = await deleteArtwork(client, "a1");

    expect(del).toHaveBeenCalledWith({ param: { id: "a1" } });
    expect(result.ok).toBe(true);
  });

  it("非 ok は失敗に正規化する", async () => {
    const { client } = mockClient({
      del: vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    });
    const result = await deleteArtwork(client, "a1");
    expect(result.ok).toBe(false);
  });

  it("RPC 例外を失敗に倒す", async () => {
    const { client } = mockClient({
      del: vi.fn().mockRejectedValue(new Error("network")),
    });
    const result = await deleteArtwork(client, "a1");
    expect(result.ok).toBe(false);
  });
});
