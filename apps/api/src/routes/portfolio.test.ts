import { describe, expect, it } from "vitest";
import { IMAGE_WIDTHS } from "../lib/image/url";
import type {
  PortfolioData,
  PortfolioRepository,
} from "../repositories/portfolio-repository";
import { createPortfolioRoutes } from "./portfolio";

// C4 公開ポートフォリオルート（FR-11,12,13,15 / NFR-06 未認証読み取り）。
// portfolioRepo は in-memory モック。IMAGE_BASE_URL は env 注入。DB 非依存。
// 公開モデル（ADR D12 / §6.10）: published かつ portfolio_item に入る作品を position 昇順。
// リポジトリが「公開・掲載・順序」を解決済みで返す前提（route は整形のみ）。

const IMAGE_BASE_URL = "https://cdn.example.com";

/** env を注入して app.request を呼ぶヘルパ。 */
function request(repo: PortfolioRepository, path: string) {
  const app = createPortfolioRoutes({ portfolioRepo: repo });
  return app.request(path, {}, { IMAGE_BASE_URL });
}

/** 固定データを返すだけのモック repo。 */
function mockRepo(bySlug: Record<string, PortfolioData>): PortfolioRepository {
  return {
    async getBySlug(slug) {
      return bySlug[slug] ?? null;
    },
  };
}

// repo は掲載済み・published・position 昇順に解決済みで返す。
const PORTFOLIO: PortfolioData = {
  profile: { slug: "alice", displayName: "Alice", bio: "painter" },
  artworks: [
    {
      id: "art-a",
      title: "A",
      description: "first",
      status: "published",
      position: 0,
      images: [
        { id: "img-a2", r2Key: "artworks/a2.jpg", sortOrder: 1 },
        { id: "img-a1", r2Key: "artworks/a1.jpg", sortOrder: 0 },
      ],
    },
    {
      id: "art-b",
      title: "B",
      description: "second",
      status: "published",
      position: 1,
      images: [{ id: "img-b1", r2Key: "artworks/b1.jpg", sortOrder: 0 }],
    },
  ],
};

describe("GET /portfolio/:slug", () => {
  it("returns 200 with the artist profile for an existing slug", async () => {
    const res = await request(mockRepo({ alice: PORTFOLIO }), "/alice");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      profile: { slug: string; displayName: string; bio: string | null };
    };
    expect(body.profile).toEqual({
      slug: "alice",
      displayName: "Alice",
      bio: "painter",
    });
  });

  it("returns the portfolio artworks in the repository order (position asc)", async () => {
    const res = await request(mockRepo({ alice: PORTFOLIO }), "/alice");
    const body = (await res.json()) as { artworks: { id: string }[] };
    expect(body.artworks.map((a) => a.id)).toEqual(["art-a", "art-b"]);
  });

  it("returns images with thumbnailUrl/largeUrl from IMAGE_BASE_URL in sort order", async () => {
    const res = await request(mockRepo({ alice: PORTFOLIO }), "/alice");
    const body = (await res.json()) as {
      artworks: {
        id: string;
        images: { thumbnailUrl: string; largeUrl: string }[];
      }[];
    };
    const artA = body.artworks.find((a) => a.id === "art-a");
    expect(artA).toBeDefined();
    // sortOrder 昇順（a1 が先、a2 が後）。
    expect(artA?.images).toHaveLength(2);
    const first = artA?.images[0];
    expect(first?.thumbnailUrl).toContain(IMAGE_BASE_URL);
    expect(first?.thumbnailUrl).toContain(
      `/cdn-cgi/image/width=${IMAGE_WIDTHS.thumbnail}`,
    );
    expect(first?.thumbnailUrl).toContain("artworks/a1.jpg");
    expect(first?.largeUrl).toContain(
      `/cdn-cgi/image/width=${IMAGE_WIDTHS.large}`,
    );
    expect(first?.largeUrl).toContain("artworks/a1.jpg");
    // a2 が 2 番目。
    expect(artA?.images[1]?.thumbnailUrl).toContain("artworks/a2.jpg");
  });

  it("does not leak r2Key into the public DTO", async () => {
    const res = await request(mockRepo({ alice: PORTFOLIO }), "/alice");
    const body = (await res.json()) as {
      artworks: { images: Record<string, unknown>[] }[];
    };
    expect(body.artworks[0]?.images[0]).not.toHaveProperty("r2Key");
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await request(mockRepo({ alice: PORTFOLIO }), "/nobody");
    expect(res.status).toBe(404);
  });

  it("is accessible without authentication (no requireAuth)", async () => {
    // セッション middleware も user も一切設定していない app で 200 を返す。
    const res = await request(mockRepo({ alice: PORTFOLIO }), "/alice");
    expect(res.status).toBe(200);
  });
});
