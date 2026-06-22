// B6 横断検索コア（FR-17 作品・作者を横断検索 / §6.9）。api クライアント（D1 の
// `createApiClient`）を注入し、C5 `GET /api/search?q=`（未認証・公開 DTO）を呼んで結果を
// 正規化する。検索は未認証で叩けるため Cookie 転送は不要。空クエリ（trim 後空）なら api を
// 呼ばず空結果を返す（api 側 `isBlankSearch` と整合・無駄な往復を避ける）。
// next 非依存・純ロジックなのでユニットテスト対象（ページは薄いラッパで非対象 → /verify）。
// web は DB に触れず、必ず api 経由（ADR D7）。

import type { SearchResponseDto } from "@artwork/shared";
import type { ApiClient } from "./api";

/** 横断検索 DTO（C5 `GET /api/search` のレスポンス形 / @artwork/shared と共有）。 */
export type SearchDto = SearchResponseDto;

/**
 * C5b: `AppType` に /api/search のルート型が載るため、コアは型付き RPC クライアント
 * （`ApiClient`）をそのまま受け取る（NFR-11 / ADR D5）。C5 は未認証ルートなので
 * Cookie 転送なしの `createApiClient()` で呼べる。
 */
export type SearchClient = ApiClient;

/**
 * 正規化済みの結果。
 * - 成功: `{ ok:true, data }`
 * - 失敗: `{ ok:false, error }`
 */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** 空クエリ（trim 後空）の空結果。 */
const EMPTY: SearchDto = { artworks: [], artists: [] };

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

/** C5 公開 DTO（JSON）を web の DTO へ正規化する（防御的に型を整える）。 */
function toSearch(raw: unknown): SearchDto {
  const r = (raw ?? {}) as Record<string, unknown>;
  const artworks = Array.isArray(r.artworks) ? r.artworks : [];
  const artists = Array.isArray(r.artists) ? r.artists : [];
  return {
    artworks: artworks.map((a) => {
      const art = (a ?? {}) as Record<string, unknown>;
      return {
        id: typeof art.id === "string" ? art.id : "",
        title: typeof art.title === "string" ? art.title : "",
        // slug は任意。文字列のときだけ載せる（exactOptionalPropertyTypes）。
        ...(typeof art.slug === "string" ? { slug: art.slug } : {}),
        thumbnailUrl:
          typeof art.thumbnailUrl === "string" ? art.thumbnailUrl : null,
      };
    }),
    artists: artists.map((a) => {
      const artist = (a ?? {}) as Record<string, unknown>;
      return {
        slug: typeof artist.slug === "string" ? artist.slug : "",
        displayName:
          typeof artist.displayName === "string" ? artist.displayName : "",
      };
    }),
  };
}

/**
 * クエリ文字列から作品・作者を横断検索する（FR-17 / §6.9）。
 * - trim 後空なら api を呼ばず空結果（api の `isBlankSearch` と整合）。
 * - 非空なら C5 `GET /api/search?q=` を呼び、公開 DTO を正規化して返す。
 */
export async function searchAll(
  client: SearchClient,
  q: string,
): Promise<Result<SearchDto>> {
  const trimmed = q.trim();
  if (trimmed === "") {
    return { ok: true, data: EMPTY };
  }

  try {
    const res = await client.api.search.$get({ query: { q: trimmed } });
    if (!res.ok) return { ok: false, error: await errorFrom(res) };
    return { ok: true, data: toSearch(await res.json()) };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

function messageOf(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "通信に失敗しました";
}
