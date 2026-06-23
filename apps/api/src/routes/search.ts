/**
 * C5 横断検索ルート（FR-17 作品・作者・ポートフォリオを横断検索 /
 * NFR-05 pg_trgm / NFR-06 未認証の公開ディスカバリ）。
 *
 * - 未認証（`requireAuth` を付けない）。誰でも `?q=` で公開作品・公開作者を検索できる。
 * - `q` が空白のみ（B7 `isBlankSearch`）なら repo を呼ばず 200 で空結果を返す
 *   （無意味な全表 ILIKE を避ける）。
 * - 取得は `SearchRepository` に委ね、テストでは in-memory モックを注入する（DB 非依存）。
 * - 画像 URL は B5 `thumbnailUrl` で `IMAGE_BASE_URL`（env）から組み立て、
 *   スキーマ型（r2Key 等）を web に漏らさない公開 DTO に変換する（ADR D5）。
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { SearchResponseDto } from "@artwork/shared";
import type { AppBindings } from "../env";
import { thumbnailUrl } from "../lib/image/url";
import { isBlankSearch } from "../lib/search";
import type { SearchRepository } from "../repositories/search-repository";

// 検索の入出力 DTO は `@artwork/shared` に定義し、web と型を共有する（NFR-11 / ADR D5）。
export type {
  SearchArtistDto,
  SearchArtworkDto,
  SearchResponseDto,
} from "@artwork/shared";

/** 検索ルートの依存。テストでモック repo を注入する。 */
export interface SearchRoutesDeps {
  searchRepo: SearchRepository;
}

type AppEnv = {
  Bindings: AppBindings;
  Variables: { searchDeps?: SearchRoutesDeps };
};

/**
 * deps を解決する。明示注入（テスト）を優先し、無ければ context（本番 middleware）から取る。
 */
function resolveDeps(
  injected: SearchRoutesDeps | undefined,
  c: { get: (k: "searchDeps") => SearchRoutesDeps | undefined },
): SearchRoutesDeps {
  const deps = injected ?? c.get("searchDeps");
  if (!deps) {
    throw new HTTPException(500, { message: "search deps not configured" });
  }
  return deps;
}

/**
 * 公開検索ルートを生成する。
 *
 * - テスト: `createSearchRoutes({ searchRepo })` で注入。
 * - 本番: deps を省略し、env(DATABASE_URL) 依存の deps を middleware で
 *   `c.set('searchDeps', ...)` してから mount する。
 *
 * メソッドチェーンで `.get(...)` を合成し、`typeof` に RPC 型が載る形にする（NFR-11）。
 */
export function createSearchRoutes(injectedDeps?: SearchRoutesDeps) {
  return new Hono<AppEnv>().get("/search", async (c) => {
    const q = c.req.query("q") ?? "";

    // 空白のみ・空は repo を呼ばず空結果（NFR-05 の無駄な全表検索を避ける）。
    if (isBlankSearch(q)) {
      const empty: SearchResponseDto = { artworks: [], artists: [] };
      return c.json(empty);
    }

    const deps = resolveDeps(injectedDeps, c);
    const baseUrl = c.env.IMAGE_BASE_URL;

    const { artworks, artists } = await deps.searchRepo.search(q);

    const body: SearchResponseDto = {
      artworks: artworks.map((row) => ({
        id: row.id,
        title: row.title,
        // slug は任意プロパティ。null/undefined のときは出力しない（exactOptionalPropertyTypes）。
        ...(row.slug != null ? { slug: row.slug } : {}),
        artistSlug: row.artistSlug,
        thumbnailUrl:
          row.r2Key != null ? thumbnailUrl(baseUrl, row.r2Key) : null,
      })),
      artists: artists.map((row) => ({
        slug: row.slug,
        displayName: row.displayName,
      })),
    };

    return c.json(body);
  });
}
