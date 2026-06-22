/**
 * C5 横断検索リポジトリ層（FR-17 作品・作者・ポートフォリオを横断検索 /
 * NFR-05 pg_trgm + GIN による部分一致）。
 *
 * ルートは `SearchRepository` インターフェースにのみ依存し、テストでは in-memory
 * モックを注入する（DB / ネットワーク非依存）。drizzle 実装は
 * `createSearchRepository(db)` として提供するが、実 DB 接続が要るため
 * ユニットテストはしない（型のみ担保 / 実 DB 統合は E2）。
 *
 * 検索条件は B7 `buildArtworkSearch` / `buildArtistSearch`（pg_trgm ILIKE）で組み立て、
 * 公開対象のみを返す:
 *   - artwork: is_draft=false かつ is_public=true（status は公開条件に関与しない）。
 *   - artist : 公開プロフィール（artist_profile は公開前提のため slug を持つ全件）。
 * 作品には先頭画像（sort_order 昇順の先頭）の r2_key を含める。
 * 可視判定済みの素データを返し、画像 URL 組み立て・DTO 整形はルート層に委ねる（ADR D5）。
 */

import { and, asc, eq, sql } from "drizzle-orm";
import type { createDb } from "@artwork/database";
import {
  artistProfile,
  artwork,
  artworkImage,
} from "@artwork/database/schema";
import { buildArtistSearch, buildArtworkSearch } from "../lib/search";

/** drizzle の DB ハンドル型（`createDb()` の戻り値）。 */
type Database = ReturnType<typeof createDb>;

/**
 * 検索ヒットした作品（可視フィルタ適用済み・URL 組み立て前の素データ）。
 * `slug` は将来の作品個別 URL 用（現スキーマには無く常に null）。
 * `r2Key` は先頭画像のキー（画像未登録なら null）。スキーマ型は web に漏らさない（ADR D5）。
 */
export interface SearchArtworkRow {
  id: string;
  title: string;
  slug: string | null;
  /** 作者の公開 slug（artist_profile.slug を join して取得）。公開作品詳細 URL 用。 */
  artistSlug: string;
  r2Key: string | null;
}

/** 検索ヒットした作者（公開プロフィール）。 */
export interface SearchArtistRow {
  slug: string;
  displayName: string;
}

/** 横断検索の戻り値（公開対象のみ）。 */
export interface SearchResult {
  artworks: SearchArtworkRow[];
  artists: SearchArtistRow[];
}

/**
 * 横断検索リポジトリの契約。ルートはこれにのみ依存する。
 * `term` は非空の検索語（空判定はルート層の `isBlankSearch` で済ませる）。
 */
export interface SearchRepository {
  search(term: string): Promise<SearchResult>;
}

/**
 * drizzle 実装。`@artwork/database` の `createDb()` で得た db を渡す（生 neon/drizzle は呼ばない）。
 *
 * - 作品: B7 `buildArtworkSearch`（title/description の ILIKE）に
 *   (is_draft=false)+public を AND して検索。先頭画像（sort_order 昇順）の r2_key を相関サブクエリで取得。
 * - 作者: B7 `buildArtistSearch`（display_name の ILIKE）で公開プロフィールを検索。
 */
export function createSearchRepository(db: Database): SearchRepository {
  return {
    async search(term) {
      const artworkCondition = buildArtworkSearch(term);
      const artistCondition = buildArtistSearch(term);

      // 先頭画像の r2_key（sort_order 昇順の先頭 1 件）を相関サブクエリで引く。
      const firstImageKey = sql<string | null>`(
        select ${artworkImage.r2Key}
        from ${artworkImage}
        where ${artworkImage.artworkId} = ${artwork.id}
        order by ${artworkImage.sortOrder} asc
        limit 1
      )`;

      const artworkRows = await db
        .select({
          id: artwork.id,
          title: artwork.title,
          // 公開作品詳細 URL 用に作者の slug を join して取得。
          artistSlug: artistProfile.slug,
          r2Key: firstImageKey,
        })
        .from(artwork)
        .innerJoin(
          artistProfile,
          eq(artwork.artistProfileId, artistProfile.id),
        )
        .where(
          and(
            eq(artwork.isDraft, false),
            eq(artwork.isPublic, true),
            artworkCondition,
          ),
        )
        .orderBy(asc(artwork.sortOrder));

      const artistRows = await db
        .select({
          slug: artistProfile.slug,
          displayName: artistProfile.displayName,
        })
        .from(artistProfile)
        .where(artistCondition)
        .orderBy(asc(artistProfile.displayName));

      return {
        artworks: artworkRows.map((row) => ({
          id: row.id,
          title: row.title,
          // 現スキーマに作品 slug は無いため常に null（型は将来用に確保）。
          slug: null,
          artistSlug: row.artistSlug,
          r2Key: row.r2Key,
        })),
        artists: artistRows.map((row) => ({
          slug: row.slug,
          displayName: row.displayName,
        })),
      };
    },
  };
}
