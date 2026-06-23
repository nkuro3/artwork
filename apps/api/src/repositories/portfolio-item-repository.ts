/**
 * ポートフォリオ編集リポジトリ層（§6.12 `/portfolio/edit` / FR-12,13 / ADR D12）。
 *
 * 「1人1ポートフォリオ」。所有者（user_id）が自分の**公開（published）作品**から
 * 掲載する作品を選び、`position` で並べる。掲載集合は portfolio_item に永続化する。
 *
 * ルートは `PortfolioItemRepository` インターフェースにのみ依存し、テストでは in-memory
 * モックを注入する（DB / ネットワーク非依存）。drizzle 実装は
 * `createPortfolioItemRepository(db)` として提供するが、実 DB 接続が要るため
 * ユニットテストはしない（型のみ担保 / 実 DB 統合は別途）。
 *
 * 内部キー（r2Key）は web に漏らさず（ADR D5）、サムネ URL はルート層で組み立てる。
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import type { createDb } from "@artwork/database";
import {
  artwork,
  artworkImage,
  portfolioItem,
} from "@artwork/database/schema";

/** drizzle の DB ハンドル型（`createDb()` の戻り値）。 */
type Database = ReturnType<typeof createDb>;

/**
 * ポートフォリオ編集画面に並ぶ「自分の公開作品」1 件。
 * `inPortfolio` は現在の掲載有無、`position` は掲載中の表示順（未掲載は null）。
 * `thumbnailR2Key` は先頭画像のキー（画像なし=null）。ルート層で `thumbnailUrl` 化する（ADR D5）。
 */
export interface PortfolioEditableArtwork {
  id: string;
  title: string;
  inPortfolio: boolean;
  position: number | null;
  thumbnailR2Key: string | null;
}

/**
 * ポートフォリオ編集リポジトリの契約。ルートはこれにのみ依存する。
 */
export interface PortfolioItemRepository {
  /**
   * 当該ユーザーの**公開（published）作品**を返す。各作品に現在の掲載有無
   * （`inPortfolio`）と掲載順（`position`、未掲載は null）を付す。
   * 並びは「掲載中（position 昇順）→ 未掲載（created_at 昇順）」。
   */
  listPublishedForUser(userId: string): Promise<PortfolioEditableArtwork[]>;
  /**
   * 当該ユーザーの掲載集合を `artworkIds`（表示順）で置換する。
   * position は配列 index。リストに無い既存掲載は削除する。
   * **前提**: `artworkIds` は呼び出し側で「当該ユーザー所有 かつ published」を検証済み。
   */
  replaceForUser(userId: string, artworkIds: string[]): Promise<void>;
}

/**
 * drizzle 実装。`@artwork/database` の `createDb()` で得た db を渡す（生 neon/drizzle は呼ばない）。
 * 認可（所有者一致・published 検証）はルート層で担保する（ADR D8 / SEC-01）。
 */
export function createPortfolioItemRepository(
  db: Database,
): PortfolioItemRepository {
  return {
    async listPublishedForUser(userId) {
      // 自分の公開作品（published）と、掲載中なら position を左外部結合で取得。
      const rows = await db
        .select({
          id: artwork.id,
          title: artwork.title,
          createdAt: artwork.createdAt,
          position: portfolioItem.position,
        })
        .from(artwork)
        .leftJoin(portfolioItem, eq(portfolioItem.artworkId, artwork.id))
        .where(
          and(eq(artwork.userId, userId), eq(artwork.status, "published")),
        )
        .orderBy(asc(artwork.createdAt));

      if (rows.length === 0) return [];

      // 先頭画像（sort_order 昇順）の r2_key を一括取得し、作品ごとにまとめる。
      const ids = rows.map((r) => r.id);
      const imageRows = await db
        .select({
          artworkId: artworkImage.artworkId,
          r2Key: artworkImage.r2Key,
          sortOrder: artworkImage.sortOrder,
        })
        .from(artworkImage)
        .where(inArray(artworkImage.artworkId, ids))
        .orderBy(asc(artworkImage.sortOrder));

      const firstKeyByArtwork = new Map<string, string>();
      for (const img of imageRows) {
        if (!firstKeyByArtwork.has(img.artworkId)) {
          firstKeyByArtwork.set(img.artworkId, img.r2Key);
        }
      }

      const items: PortfolioEditableArtwork[] = rows.map((r) => ({
        id: r.id,
        title: r.title,
        inPortfolio: r.position !== null,
        position: r.position,
        thumbnailR2Key: firstKeyByArtwork.get(r.id) ?? null,
      }));

      // 掲載中（position 昇順）→ 未掲載（created_at 昇順）。
      return items.sort((a, b) => {
        if (a.position === null && b.position === null) return 0;
        if (a.position === null) return 1;
        if (b.position === null) return -1;
        return a.position - b.position;
      });
    },

    async replaceForUser(userId, artworkIds) {
      // 既存掲載を全削除してから index 順に挿入する（掲載集合の置換）。
      // 1ユーザー1ポートフォリオのため user_id でまとめて消す。
      await db.delete(portfolioItem).where(eq(portfolioItem.userId, userId));
      if (artworkIds.length === 0) return;
      await db.insert(portfolioItem).values(
        artworkIds.map((artworkId, index) => ({
          userId,
          artworkId,
          position: index,
        })),
      );
    },
  };
}
