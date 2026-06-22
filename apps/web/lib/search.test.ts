import { describe, expect, it, vi } from "vitest";
import { type SearchClient, type SearchDto, searchAll } from "./search";

// B6 横断検索コア（FR-17 / §6.9）。api クライアントを注入し、C5 `GET /api/search?q=`
// （未認証・公開 DTO）を呼んで結果を正規化する。空クエリ（trim 後空）なら api を
// 呼ばず空結果を返す。next 非依存・純ロジックのみをユニットテスト（画面は薄いラッパで
// 非対象 → /verify）。web は DB に触れず必ず api 経由（ADR D7）。

/** Response 風オブジェクト（hono RPC の $get の戻りに合わせた最小形）。 */
function res(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// C5 の公開 DTO（JSON 化後）。
const SAMPLE: SearchDto = {
  artworks: [
    { id: "a1", title: "月", thumbnailUrl: "https://img/t1" },
    { id: "a2", title: "星", thumbnailUrl: null },
  ],
  artists: [{ slug: "yoru", displayName: "夜のアーティスト" }],
};

/** search コアが使う RPC 部分集合のモックを作る。 */
function mockClient(get?: ReturnType<typeof vi.fn>) {
  const fn = get ?? vi.fn().mockResolvedValue(res(SAMPLE));
  const client = {
    api: {
      search: { $get: fn },
    },
  } as unknown as SearchClient;
  return { client, get: fn };
}

describe("searchAll", () => {
  it("空クエリ（空文字）は api を呼ばず空結果を返す", async () => {
    const { client, get } = mockClient();
    const result = await searchAll(client, "");
    expect(get).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ artworks: [], artists: [] });
  });

  it("空白のみ（trim 後空）も api を呼ばず空結果を返す", async () => {
    const { client, get } = mockClient();
    const result = await searchAll(client, "   　 ");
    expect(get).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ artworks: [], artists: [] });
  });

  it("非空クエリは GET /api/search?q= を query で呼ぶ", async () => {
    const { client, get } = mockClient();
    await searchAll(client, "月");
    expect(get).toHaveBeenCalledWith({ query: { q: "月" } });
  });

  it("200 を DTO に正規化して返す", async () => {
    const { client } = mockClient();
    const result = await searchAll(client, "月");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(SAMPLE);
  });

  it("欠損フィールドは防御的に正規化する", async () => {
    const { client } = mockClient(
      vi.fn().mockResolvedValue(
        res({
          artworks: [{ id: "a1", title: "月" }, null],
          artists: [{ slug: "yoru" }],
        }),
      ),
    );
    const result = await searchAll(client, "月");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.artworks).toEqual([
        { id: "a1", title: "月", thumbnailUrl: null },
        { id: "", title: "", thumbnailUrl: null },
      ]);
      expect(result.data.artists).toEqual([{ slug: "yoru", displayName: "" }]);
    }
  });

  it("artworks/artists が無くても空配列に正規化する", async () => {
    const { client } = mockClient(vi.fn().mockResolvedValue(res({})));
    const result = await searchAll(client, "月");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ artworks: [], artists: [] });
  });

  it("非 ok レスポンスはエラーに倒す", async () => {
    const { client } = mockClient(
      vi.fn().mockResolvedValue(res({ message: "boom" }, false, 500)),
    );
    const result = await searchAll(client, "月");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("boom");
  });

  it("RPC 例外をエラーに倒す", async () => {
    const { client } = mockClient(
      vi.fn().mockRejectedValue(new Error("network")),
    );
    const result = await searchAll(client, "月");
    expect(result.ok).toBe(false);
  });
});
