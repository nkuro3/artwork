/**
 * C4 公開ポートフォリオルート（FR-11 公開 URL `/p/{slug}` 相当 / FR-12 公開作品のみ /
 * FR-13 sort_order 昇順 / FR-15 用途別画像 URL / NFR-06 未認証読み取り）。
 *
 * - 未認証（`requireAuth` を付けない）。誰でも slug から作者プロフィールと公開作品を読める。
 * - 取得は `PortfolioRepository` に委ね、テストでは in-memory モックを注入する（DB 非依存）。
 * - 可視フィルタは B4 `filterPublicArtworks`（公開のみ・sort_order 昇順）をルートで適用。
 * - 画像 URL は B5 `thumbnailUrl`/`largeUrl` で `IMAGE_BASE_URL`（env）から組み立て、
 *   スキーマ型（r2Key 等）を web に漏らさない公開 DTO に変換する（ADR D5）。
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppBindings } from "../env";
import { largeUrl, thumbnailUrl } from "../lib/image/url";
import type {
  PortfolioImage,
  PortfolioRepository,
} from "../repositories/portfolio-repository";

/** ポートフォリオルートの依存。テストでモック repo を注入する。 */
export interface PortfolioRoutesDeps {
  portfolioRepo: PortfolioRepository;
}

type AppEnv = {
  Bindings: AppBindings;
  Variables: { portfolioDeps?: PortfolioRoutesDeps };
};

/** 公開する画像 DTO（用途別サイズ URL のみ / スキーマ型を漏らさない）。 */
interface PublicImageDto {
  thumbnailUrl: string;
  largeUrl: string;
}

/** 公開する作品 DTO。 */
interface PublicArtworkDto {
  id: string;
  title: string;
  description: string | null;
  images: PublicImageDto[];
}

/** 公開するポートフォリオ DTO。 */
interface PublicPortfolioDto {
  profile: { slug: string; displayName: string; bio: string | null };
  artworks: PublicArtworkDto[];
}

/**
 * deps を解決する。明示注入（テスト）を優先し、無ければ context（本番 middleware）から取る。
 */
function resolveDeps(
  injected: PortfolioRoutesDeps | undefined,
  c: { get: (k: "portfolioDeps") => PortfolioRoutesDeps | undefined },
): PortfolioRoutesDeps {
  const deps = injected ?? c.get("portfolioDeps");
  if (!deps) {
    throw new HTTPException(500, { message: "portfolio deps not configured" });
  }
  return deps;
}

/** 画像を sortOrder 昇順に並べ、用途別 URL の公開 DTO に変換する（B5）。 */
function toImageDtos(
  images: readonly PortfolioImage[],
  baseUrl: string,
): PublicImageDto[] {
  return [...images]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((img) => ({
      thumbnailUrl: thumbnailUrl(baseUrl, img.r2Key),
      largeUrl: largeUrl(baseUrl, img.r2Key),
    }));
}

/**
 * 公開ポートフォリオルートを生成する。
 *
 * - テスト: `createPortfolioRoutes({ portfolioRepo })` で注入。
 * - 本番: deps を省略し、env(DATABASE_URL) 依存の deps を middleware で
 *   `c.set('portfolioDeps', ...)` してから mount する。
 */
export function createPortfolioRoutes(injectedDeps?: PortfolioRoutesDeps) {
  // メソッドチェーンで合成し、`ReturnType<typeof createPortfolioRoutes>` に
  // ルートの入出力型を載せる（NFR-11 / ADR D5）。
  return new Hono<AppEnv>().get("/:slug", async (c) => {
    // 公開読み取り（NFR-06）。認証は掛けない。
    const deps = resolveDeps(injectedDeps, c);
    const slug = c.req.param("slug");

    const data = await deps.portfolioRepo.getBySlug(slug);
    if (data === null) {
      throw new HTTPException(404, { message: "Not Found" });
    }

    const baseUrl = c.env.IMAGE_BASE_URL;

    // 掲載・公開（status='published'）・position 昇順はリポジトリで解決済み（ADR D12 / §6.10）。
    const body: PublicPortfolioDto = {
      profile: {
        slug: data.profile.slug,
        displayName: data.profile.displayName,
        bio: data.profile.bio,
      },
      artworks: data.artworks.map((art) => ({
        id: art.id,
        title: art.title,
        description: art.description,
        images: toImageDtos(art.images, baseUrl),
      })),
    };

    return c.json(body);
  });
}
