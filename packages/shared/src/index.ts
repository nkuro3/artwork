// @artwork/shared — web と api で共有する型・ユーティリティ。
//
// 型共有の方針（NFR-11 / ADR D5）:
// - DTO（リクエスト/レスポンス型）はここ（shared）に定義する。api はこれを import し、
//   web も import する。依存方向は web/api → shared の一方向で、循環を作らない。
// - Hono RPC の `AppType`（`typeof app`）は api に依存する性質上 shared には置けない。
//   web は `@artwork/api` から `AppType` を import して `hc<AppType>()` を組む
//   （web → api → shared の一方向。shared → api の逆辺は張らない）。

export const SHARED_PACKAGE = "@artwork/shared" as const;

/**
 * 公開する作品検索 DTO（C5 / FR-17）。
 * 先頭画像のサムネ URL のみを持ち、スキーマ型（r2Key 等）は漏らさない（ADR D5）。
 */
export interface SearchArtworkDto {
  id: string;
  title: string;
  slug?: string;
  /** 作者の公開 slug（公開作品詳細 `/p/{artistSlug}/{id}` への遷移用）。作品 slug とは別。 */
  artistSlug: string;
  /** 先頭画像のサムネイル URL。画像未登録なら null。 */
  thumbnailUrl: string | null;
}

/** 公開する作者検索 DTO（C5 / FR-17）。 */
export interface SearchArtistDto {
  slug: string;
  displayName: string;
}

/** 横断検索レスポンス DTO（`GET /search` の本体 / NFR-11）。 */
export interface SearchResponseDto {
  artworks: SearchArtworkDto[];
  artists: SearchArtistDto[];
}
