/**
 * B7 検索クエリ組立（FR-17 横断検索 / NFR-05 pg_trgm + GIN による部分一致）。
 *
 * 純ロジックのみ。DB は叩かず、drizzle-orm の `sql`/`ilike`/`or` で
 * SQL フラグメント（WHERE 条件式）を組み立てて返すだけ。
 *
 * A2 で `artwork.title` / `artwork.description` / `artist_profile.display_name`
 * に pg_trgm の GIN index を作成済み。GIN(trgm) は `ILIKE '%term%'` を加速するため、
 * 類似度関数ではなく ILIKE 部分一致で条件を組む（日本語含む）。
 */

import type { SQL } from "drizzle-orm";
import { ilike, or, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { artistProfile, artwork } from "@artwork/database/schema";

/** 検索語の最大長（DoS / 無意味な巨大パターンの防止）。 */
const MAX_TERM_LENGTH = 100;

/**
 * 生の検索入力を正規化する。
 *
 * - 前後の空白を trim し、内部の連続空白（全角は対象外）を半角スペース 1 個に圧縮。
 * - `MAX_TERM_LENGTH` で切り詰め。
 * - LIKE/ILIKE のメタ文字 `%` `_` と エスケープ文字 `\` をエスケープし、
 *   ユーザ入力がパターンとして悪用されないようにする
 *   （`\` を最初に処理して二重エスケープを避ける）。
 * - 空・空白のみは空文字を返す。
 */
export function sanitizeSearchTerm(input: string): string {
  const collapsed = input.trim().replace(/\s+/g, " ");
  if (collapsed === "") return "";

  const escaped = collapsed
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");

  return escaped.slice(0, MAX_TERM_LENGTH);
}

/** 正規化後に空になる（＝実質的に検索語がない）入力かどうか。 */
export function isBlankSearch(input: string): boolean {
  return sanitizeSearchTerm(input) === "";
}

/**
 * 任意の列集合に対する pg_trgm 部分一致条件を組み立てる（汎用・主 API）。
 *
 * - `rawTerm` を `sanitizeSearchTerm` で正規化し、空 or 列なしなら `undefined`
 *   （＝検索条件を付けない）を返す。
 * - 非空なら各列について `col ILIKE '%' || term || '%'` を生成し `or(...)` で結合。
 * - エスケープ済み term は drizzle のパラメータとして束縛する（`sql` テンプレートの
 *   `${...}` がプレースホルダになる）。SQL へ値を文字列連結しないため
 *   インジェクション耐性を持つ。
 */
export function buildTrigramSearch(
  columns: readonly PgColumn[],
  rawTerm: string,
): SQL | undefined {
  const term = sanitizeSearchTerm(rawTerm);
  if (term === "" || columns.length === 0) return undefined;

  // ワイルドカードで包んだ「束縛値」を 1 つ作り、全列で再利用する。
  // 文字列連結ではなくパラメータ化されるため安全。
  const pattern = `%${term}%`;

  const conditions = columns.map((column) => ilike(column, pattern));

  // 単一列なら or() を介さずそのまま返す（不要な括弧/OR を避ける）。
  return conditions.length === 1 ? conditions[0] : or(...conditions);
}

/**
 * 作品検索の薄いラッパ（FR-17）。`title` と `description` を横断する。
 * 作者名まで広げる場合は join 済みクエリ側で `buildTrigramSearch` に
 * `artistProfile.displayName` を加えて使う。
 */
export function buildArtworkSearch(rawTerm: string): SQL | undefined {
  return buildTrigramSearch([artwork.title, artwork.description], rawTerm);
}

/**
 * 作者プロフィール検索の薄いラッパ（FR-17）。`display_name` を対象にする。
 */
export function buildArtistSearch(rawTerm: string): SQL | undefined {
  return buildTrigramSearch([artistProfile.displayName], rawTerm);
}

// `sql` は将来の拡張（例: similarity() 並べ替え）用に re-export しておく。
export { sql };
