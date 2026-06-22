/**
 * C4 公開ポートフォリオ取得層（FR-11 公開 URL `/p/{slug}` 相当 / FR-12 公開作品のみ /
 * FR-13 sort_order 昇順 / FR-15 用途別画像）。
 *
 * ルートは `PortfolioRepository` インターフェースにのみ依存し、テストでは in-memory
 * モックを注入する（DB / ネットワーク非依存）。drizzle 実装は
 * `createPortfolioRepository(db)` として提供するが、実 DB 接続が要るため
 * ユニットテストはしない（型のみ担保 / 実 DB 統合は E2）。
 *
 * 可視フィルタ（B4）と画像 URL 組み立て（B5）はルート層で適用する。
 * ここでは「slug の作者プロフィール + 作品（全件）+ 各作品の画像」を素直に返す。
 * スキーマ型をそのまま web へ漏らさず（ADR D5）、API 内部表現を公開する。
 */

import { asc, eq } from "drizzle-orm";
import type { createDb } from "@artwork/database";
import {
  artistProfile,
  artwork,
  artworkImage,
} from "@artwork/database/schema";
import type { ArtworkStatus } from "../lib/visibility";

/** drizzle の DB ハンドル型（`createDb()` の戻り値）。 */
type Database = ReturnType<typeof createDb>;

/** ポートフォリオの作者プロフィール（公開に必要な最小集合）。 */
export interface PortfolioProfile {
  slug: string;
  displayName: string;
  bio: string | null;
}

/** ポートフォリオに含まれる作品の画像（可視判定・URL 組み立て前の素データ）。 */
export interface PortfolioImage {
  id: string;
  r2Key: string;
  sortOrder: number;
}

/**
 * ポートフォリオに含まれる作品（可視フィルタ前の全件）。
 * 可視判定に必要な `isPublic` / `status` を保持する（フィルタはルートで B4 を適用）。
 */
export interface PortfolioArtwork {
  id: string;
  title: string;
  description: string | null;
  status: ArtworkStatus;
  isPublic: boolean;
  sortOrder: number;
  images: PortfolioImage[];
}

/** slug 解決の戻り値。プロフィールと作品（各作品の画像入り）。 */
export interface PortfolioData {
  profile: PortfolioProfile;
  artworks: PortfolioArtwork[];
}

/**
 * ポートフォリオ取得リポジトリの契約。ルートはこれにのみ依存する。
 */
export interface PortfolioRepository {
  /** slug に対応する作者プロフィールと作品（全件・各作品の画像入り）。無ければ null。 */
  getBySlug(slug: string): Promise<PortfolioData | null>;
}

/**
 * drizzle 実装。`@artwork/database` の `createDb()` で得た db を渡す（生 neon/drizzle は呼ばない）。
 *
 * slug → artist_profile → artwork → artwork_image を join し、PortfolioData に整形する。
 * 認可は不要（公開読み取り）。可視フィルタ・URL 組み立てはルート層に委ねる。
 */
export function createPortfolioRepository(db: Database): PortfolioRepository {
  return {
    async getBySlug(slug) {
      const profiles = await db
        .select({
          id: artistProfile.id,
          slug: artistProfile.slug,
          displayName: artistProfile.displayName,
          bio: artistProfile.bio,
        })
        .from(artistProfile)
        .where(eq(artistProfile.slug, slug))
        .limit(1);

      const profile = profiles[0];
      if (!profile) return null;

      // 作品 + 画像を一括取得し、メモリ上で作品ごとにまとめる。
      const rows = await db
        .select({
          artworkId: artwork.id,
          title: artwork.title,
          description: artwork.description,
          status: artwork.status,
          isPublic: artwork.isPublic,
          artworkSortOrder: artwork.sortOrder,
          imageId: artworkImage.id,
          imageR2Key: artworkImage.r2Key,
          imageSortOrder: artworkImage.sortOrder,
        })
        .from(artwork)
        .leftJoin(artworkImage, eq(artworkImage.artworkId, artwork.id))
        .where(eq(artwork.artistProfileId, profile.id))
        .orderBy(asc(artwork.sortOrder), asc(artworkImage.sortOrder));

      const byArtwork = new Map<string, PortfolioArtwork>();
      for (const row of rows) {
        let art = byArtwork.get(row.artworkId);
        if (!art) {
          art = {
            id: row.artworkId,
            title: row.title,
            description: row.description,
            status: row.status,
            isPublic: row.isPublic,
            sortOrder: row.artworkSortOrder,
            images: [],
          };
          byArtwork.set(row.artworkId, art);
        }
        // leftJoin のため画像が無い作品は image* が null になる。
        if (row.imageId !== null && row.imageR2Key !== null) {
          art.images.push({
            id: row.imageId,
            r2Key: row.imageR2Key,
            sortOrder: row.imageSortOrder ?? 0,
          });
        }
      }

      return {
        profile: {
          slug: profile.slug,
          displayName: profile.displayName,
          bio: profile.bio,
        },
        artworks: [...byArtwork.values()],
      };
    },
  };
}
