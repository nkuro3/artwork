import { describe, expect, it, vi } from "vitest";
import {
  buildArtworkMetadata,
  buildPortfolioMetadata,
  findArtwork,
  getPortfolio,
  portfolioTag,
  type PortfolioClient,
  type PortfolioDto,
} from "./portfolio";

// D5 公開ポートフォリオコア（FR-11〜16 / NFR-06）。api クライアントを注入し、C4
// `GET /portfolio/:slug`（未認証・公開 DTO・404 あり）を呼んで結果を正規化する。
// next 非依存・純ロジックのみをユニットテスト（ページ/Server Action は薄いラッパで非対象）。

/** Response 風オブジェクト（hono RPC の $get の戻りに合わせた最小形）。 */
function res(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// C4 の公開 DTO（JSON 化後）。
const SAMPLE: PortfolioDto = {
  profile: { slug: "yoru", displayName: "夜のアーティスト", bio: "夜を描く" },
  artworks: [
    {
      id: "a1",
      title: "月",
      description: "満月",
      images: [
        { thumbnailUrl: "https://img/t1", largeUrl: "https://img/l1" },
        { thumbnailUrl: "https://img/t2", largeUrl: "https://img/l2" },
      ],
    },
    {
      id: "a2",
      title: "星",
      description: null,
      images: [],
    },
  ],
};

/** portfolio コアが使う RPC 部分集合のモックを作る。 */
function mockClient(get?: ReturnType<typeof vi.fn>) {
  const fn = get ?? vi.fn().mockResolvedValue(res(SAMPLE));
  const client = {
    portfolio: {
      ":slug": { $get: fn },
    },
  } as unknown as PortfolioClient;
  return { client, get: fn };
}

describe("getPortfolio", () => {
  it("slug を param で RPC に渡す", async () => {
    const { client, get } = mockClient();
    await getPortfolio(client, "yoru");
    expect(get).toHaveBeenCalledWith({ param: { slug: "yoru" } });
  });

  it("200 を DTO に正規化して返す", async () => {
    const { client } = mockClient();
    const result = await getPortfolio(client, "yoru");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(SAMPLE);
  });

  it("404 は notFound 表現に倒す（error ではない）", async () => {
    const { client } = mockClient(
      vi.fn().mockResolvedValue(res({ message: "Not Found" }, false, 404)),
    );
    const result = await getPortfolio(client, "missing");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.notFound).toBe(true);
    }
  });

  it("404 以外の非 ok はエラーに倒す（notFound ではない）", async () => {
    const { client } = mockClient(
      vi.fn().mockResolvedValue(res({ message: "boom" }, false, 500)),
    );
    const result = await getPortfolio(client, "yoru");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.notFound).toBeFalsy();
      expect(result.error).toBe("boom");
    }
  });

  it("RPC 例外をエラーに倒す", async () => {
    const { client } = mockClient(
      vi.fn().mockRejectedValue(new Error("network")),
    );
    const result = await getPortfolio(client, "yoru");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.notFound).toBeFalsy();
  });
});

describe("buildPortfolioMetadata", () => {
  it("title は displayName、description は bio", () => {
    const meta = buildPortfolioMetadata(SAMPLE);
    expect(meta.title).toBe("夜のアーティスト");
    expect(meta.description).toBe("夜を描く");
  });

  it("OGP 画像は先頭作品の先頭画像 largeUrl", () => {
    const meta = buildPortfolioMetadata(SAMPLE);
    expect(meta.openGraph?.images).toEqual([{ url: "https://img/l1" }]);
  });

  it("bio が null のときはデフォルト description を使う", () => {
    const meta = buildPortfolioMetadata({
      ...SAMPLE,
      profile: { ...SAMPLE.profile, bio: null },
    });
    expect(meta.title).toBe("夜のアーティスト");
    expect(typeof meta.description).toBe("string");
    expect(meta.description).not.toBe("");
  });

  it("画像が一つも無ければ openGraph.images を持たない", () => {
    const meta = buildPortfolioMetadata({
      ...SAMPLE,
      artworks: [{ id: "a2", title: "星", description: null, images: [] }],
    });
    expect(meta.openGraph?.images).toBeUndefined();
  });

  it("作品が空でも安全（OGP 画像なし）", () => {
    const meta = buildPortfolioMetadata({ ...SAMPLE, artworks: [] });
    expect(meta.title).toBe("夜のアーティスト");
    expect(meta.openGraph?.images).toBeUndefined();
  });
});

describe("findArtwork", () => {
  it("一致する id の作品を返す", () => {
    expect(findArtwork(SAMPLE, "a1")).toEqual(SAMPLE.artworks[0]);
    expect(findArtwork(SAMPLE, "a2")).toEqual(SAMPLE.artworks[1]);
  });

  it("存在しない id は null", () => {
    expect(findArtwork(SAMPLE, "nope")).toBeNull();
  });

  it("作品が空配列なら null", () => {
    expect(findArtwork({ ...SAMPLE, artworks: [] }, "a1")).toBeNull();
  });
});

describe("buildArtworkMetadata", () => {
  it("title は作品タイトル（作者名付き）、description は作品説明", () => {
    const meta = buildArtworkMetadata(SAMPLE.profile, SAMPLE.artworks[0]!);
    expect(typeof meta.title).toBe("string");
    expect(meta.title).toContain("月");
    expect(meta.title).toContain("夜のアーティスト");
    expect(meta.description).toBe("満月");
  });

  it("OGP 画像はその作品の先頭画像 largeUrl", () => {
    const meta = buildArtworkMetadata(SAMPLE.profile, SAMPLE.artworks[0]!);
    expect(meta.openGraph?.images).toEqual([{ url: "https://img/l1" }]);
  });

  it("description が null のときはデフォルトを使う", () => {
    const meta = buildArtworkMetadata(SAMPLE.profile, SAMPLE.artworks[1]!);
    expect(typeof meta.description).toBe("string");
    expect(meta.description).not.toBe("");
  });

  it("画像が一つも無ければ openGraph.images を持たない", () => {
    const meta = buildArtworkMetadata(SAMPLE.profile, SAMPLE.artworks[1]!);
    expect(meta.openGraph?.images).toBeUndefined();
  });
});

describe("portfolioTag", () => {
  it("portfolio:<slug> 形式", () => {
    expect(portfolioTag("yoru")).toBe("portfolio:yoru");
  });
});
