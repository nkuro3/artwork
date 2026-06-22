import { describe, expect, it, vi } from "vitest";
import { IMAGE_WIDTHS } from "../lib/image/url";
import type {
  SearchArtistRow,
  SearchArtworkRow,
  SearchRepository,
} from "../repositories/search-repository";
import { createSearchRoutes } from "./search";

// C5 横断検索ルート（FR-17 / NFR-05 pg_trgm / NFR-06 公開ディスカバリ）。
// searchRepo は in-memory モック。IMAGE_BASE_URL は env 注入。DB 非依存・未認証。

const IMAGE_BASE_URL = "https://cdn.example.com";

/** env を注入して app.request を呼ぶヘルパ。 */
function request(repo: SearchRepository, path: string) {
  const app = createSearchRoutes({ searchRepo: repo });
  return app.request(path, {}, { IMAGE_BASE_URL });
}

const ARTWORKS: SearchArtworkRow[] = [
  { id: "art-1", title: "Sunset", slug: "sunset", r2Key: "artworks/a1.jpg" },
  // r2Key が無い作品（画像未登録）は thumbnailUrl=null。
  { id: "art-2", title: "No Image", slug: null, r2Key: null },
];

const ARTISTS: SearchArtistRow[] = [
  { slug: "alice", displayName: "Alice" },
];

/** 固定データを返すモック repo。呼び出し有無を spy で観測する。 */
function mockRepo(): SearchRepository & { search: ReturnType<typeof vi.fn> } {
  const search = vi.fn(async (_term: string) => ({
    artworks: ARTWORKS,
    artists: ARTISTS,
  }));
  return { search };
}

describe("GET /search", () => {
  it("returns 200 with empty results and does NOT call the repo for a blank query", async () => {
    const repo = mockRepo();
    const res = await request(repo, "/search?q=%20%20"); // 空白のみ
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ artworks: [], artists: [] });
    expect(repo.search).not.toHaveBeenCalled();
  });

  it("returns 200 with empty results when q is missing entirely", async () => {
    const repo = mockRepo();
    const res = await request(repo, "/search");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ artworks: [], artists: [] });
    expect(repo.search).not.toHaveBeenCalled();
  });

  it("calls the repo for a non-blank query and returns artwork/artist DTOs", async () => {
    const repo = mockRepo();
    const res = await request(repo, "/search?q=sun");
    expect(res.status).toBe(200);
    expect(repo.search).toHaveBeenCalledWith("sun");

    const body = (await res.json()) as {
      artworks: {
        id: string;
        title: string;
        slug?: string | null;
        thumbnailUrl: string | null;
      }[];
      artists: { slug: string; displayName: string }[];
    };

    expect(body.artists).toEqual([{ slug: "alice", displayName: "Alice" }]);

    const first = body.artworks[0];
    expect(first?.id).toBe("art-1");
    expect(first?.title).toBe("Sunset");
    expect(first?.slug).toBe("sunset");
    expect(first?.thumbnailUrl).toContain(IMAGE_BASE_URL);
    expect(first?.thumbnailUrl).toContain(
      `/cdn-cgi/image/width=${IMAGE_WIDTHS.thumbnail}`,
    );
    expect(first?.thumbnailUrl).toContain("artworks/a1.jpg");

    // 画像未登録の作品は thumbnailUrl=null。
    const second = body.artworks[1];
    expect(second?.id).toBe("art-2");
    expect(second?.thumbnailUrl).toBeNull();
  });

  it("does not leak r2Key into the public DTO", async () => {
    const repo = mockRepo();
    const res = await request(repo, "/search?q=sun");
    const body = (await res.json()) as {
      artworks: Record<string, unknown>[];
    };
    expect(body.artworks[0]).not.toHaveProperty("r2Key");
  });

  it("is accessible without authentication (no requireAuth)", async () => {
    // セッション middleware も user も一切設定していない app で 200 を返す。
    const res = await request(mockRepo(), "/search?q=sun");
    expect(res.status).toBe(200);
  });
});
