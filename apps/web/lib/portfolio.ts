// D5 公開ポートフォリオコア（FR-11 `/p/:slug` 表示 / FR-12,13 公開作品を sort_order 順 /
// FR-15 用途別画像サイズ / FR-16 最小 SEO/OGP / NFR-06 SSR + キャッシュ）。
// api クライアント（D1 の `createApiClient`）を注入し、C4 `GET /portfolio/:slug`
//（未認証・公開 DTO・404 あり）を呼んで結果を正規化する。next 非依存・純ロジックなので
// ユニットテスト対象（ページ / generateMetadata は薄いラッパで非対象 → /verify）。
// web は DB に触れず、必ず api 経由（ADR D7）。

import type { Metadata } from "next";
import type { ApiClient } from "./api";

/** 公開する画像（用途別サイズ URL のみ / C4 公開 DTO に対応）。 */
export interface PortfolioImage {
  thumbnailUrl: string;
  largeUrl: string;
}

/** 公開する作品（C4 公開 DTO に対応）。 */
export interface PortfolioArtwork {
  id: string;
  title: string;
  description: string | null;
  images: PortfolioImage[];
}

/** 公開ポートフォリオ DTO（C4 `GET /portfolio/:slug` のレスポンス形）。 */
export interface PortfolioDto {
  profile: { slug: string; displayName: string; bio: string | null };
  artworks: PortfolioArtwork[];
}

/**
 * C5b: `AppType` に /portfolio/:slug のルート型が載ったので、コアは型付き RPC
 * クライアント（`ApiClient`）をそのまま受け取る（NFR-11 / ADR D5）。
 * C4 は未認証ルートなので Cookie 転送なしの `createApiClient()` で呼べる。
 */
export type PortfolioClient = ApiClient;

/**
 * 正規化済みの結果。
 * - 成功: `{ ok:true, data }`
 * - 404: `{ ok:false, notFound:true }`（→ ページで `notFound()`）
 * - その他失敗: `{ ok:false, error }`
 */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; notFound?: boolean; error: string };

/** キャッシュタグ規約（NFR-06）。作品/プロフィール更新時に `revalidateTag` で無効化する。 */
export function portfolioTag(slug: string): string {
  return `portfolio:${slug}`;
}

/** 非 ok レスポンスからエラーメッセージを取り出す（{message} を優先）。 */
async function errorFrom(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown } | null;
    if (body && typeof body.message === "string" && body.message) {
      return body.message;
    }
  } catch {
    // ボディ無し/非 JSON は無視。
  }
  return `Request failed (${res.status})`;
}

/** C4 公開 DTO（JSON）を web の DTO へ正規化する（防御的に型を整える）。 */
function toPortfolio(raw: unknown): PortfolioDto {
  const r = (raw ?? {}) as Record<string, unknown>;
  const profile = (r.profile ?? {}) as Record<string, unknown>;
  const artworks = Array.isArray(r.artworks) ? r.artworks : [];
  return {
    profile: {
      slug: typeof profile.slug === "string" ? profile.slug : "",
      displayName:
        typeof profile.displayName === "string" ? profile.displayName : "",
      bio: typeof profile.bio === "string" ? profile.bio : null,
    },
    artworks: artworks.map((a) => {
      const art = (a ?? {}) as Record<string, unknown>;
      const images = Array.isArray(art.images) ? art.images : [];
      return {
        id: typeof art.id === "string" ? art.id : "",
        title: typeof art.title === "string" ? art.title : "",
        description: typeof art.description === "string" ? art.description : null,
        images: images.map((img) => {
          const i = (img ?? {}) as Record<string, unknown>;
          return {
            thumbnailUrl:
              typeof i.thumbnailUrl === "string" ? i.thumbnailUrl : "",
            largeUrl: typeof i.largeUrl === "string" ? i.largeUrl : "",
          };
        }),
      };
    }),
  };
}

/**
 * slug から公開ポートフォリオを取得する（FR-11 / NFR-06）。
 * C4 は未認証ルートなので Cookie 転送は不要。404 は `notFound` 表現に倒す。
 */
export async function getPortfolio(
  client: PortfolioClient,
  slug: string,
): Promise<Result<PortfolioDto>> {
  try {
    const res = await client.portfolio[":slug"].$get({ param: { slug } });
    if (res.status === 404) {
      return { ok: false, notFound: true, error: "Not Found" };
    }
    if (!res.ok) return { ok: false, error: await errorFrom(res) };
    return { ok: true, data: toPortfolio(await res.json()) };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/** OGP 画像が無いときの description フォールバック（FR-16）。 */
const DEFAULT_DESCRIPTION = "作品ポートフォリオ";

/**
 * 公開ポートフォリオの最小 SEO/OGP メタデータを組む（FR-16・純関数）。
 * - title = displayName
 * - description = bio（無ければデフォルト）
 * - openGraph.images = 先頭作品の先頭画像 largeUrl（無ければ images キーを付けない）
 */
export function buildPortfolioMetadata(portfolio: PortfolioDto): Metadata {
  const { profile, artworks } = portfolio;
  const ogImageUrl = artworks[0]?.images[0]?.largeUrl;

  return {
    title: profile.displayName,
    description: profile.bio ?? DEFAULT_DESCRIPTION,
    openGraph: {
      title: profile.displayName,
      description: profile.bio ?? DEFAULT_DESCRIPTION,
      ...(ogImageUrl ? { images: [{ url: ogImageUrl }] } : {}),
    },
  };
}

/**
 * 公開ポートフォリオの作品集合から id 一致の作品を返す（FR-14・純関数）。
 * 見つからなければ null（未公開/存在しない → ページで 404 扱い）。
 * C4 公開 DTO は公開作品のみを含むため、ここでの一致 = 公開作品である。
 */
export function findArtwork(
  portfolio: PortfolioDto,
  artworkId: string,
): PortfolioArtwork | null {
  return portfolio.artworks.find((a) => a.id === artworkId) ?? null;
}

/**
 * 作品詳細の最小 SEO/OGP メタデータを組む（FR-14/16・純関数）。
 * - title = 作品タイトル + 作者名（displayName）
 * - description = 作品 description（無ければデフォルト）
 * - openGraph.images = その作品の先頭画像 largeUrl（無ければ images キーを付けない）
 */
export function buildArtworkMetadata(
  profile: PortfolioDto["profile"],
  artwork: PortfolioArtwork,
): Metadata {
  const title = `${artwork.title} - ${profile.displayName}`;
  const description = artwork.description ?? DEFAULT_DESCRIPTION;
  const ogImageUrl = artwork.images[0]?.largeUrl;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(ogImageUrl ? { images: [{ url: ogImageUrl }] } : {}),
    },
  };
}

function messageOf(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "通信に失敗しました";
}
