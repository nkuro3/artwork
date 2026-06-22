/**
 * C3 作品画像リポジトリ層（FR-06 アップロード/並び替え / FR-07 削除）。
 *
 * ルートは `ArtworkImageRepository` インターフェースに依存し、テストでは in-memory
 * モックを注入する（DB / R2 / ネットワーク非依存）。drizzle 実装は
 * `createArtworkImageRepository(db)` として提供するが、実 DB 接続が要るため
 * ユニットテストはしない（型のみ担保 / 実 DB 統合は E2）。
 *
 * スキーマ型をそのまま web へ漏らさず（ADR D5）、API 表現型 `ArtworkImage` を公開する。
 */

import { eq } from "drizzle-orm";
import type { createDb } from "@artwork/database";
import { artworkImage } from "@artwork/database/schema";

/** drizzle の DB ハンドル型（`createDb()` の戻り値）。 */
type Database = ReturnType<typeof createDb>;

/**
 * 永続化された作品画像行（API 表現）。
 * CRUD / 並び替え / R2 削除に必要な最小集合のみ公開する。
 */
export interface ArtworkImage {
  id: string;
  artworkId: string;
  userId: string;
  r2Key: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
  createdAt: Date;
}

/**
 * 画像メタ作成の入力。`userId` はサーバー側で付与される（クライアント値は信用しない / SEC-01）。
 * `sortOrder` はルート層で `nextSortOrder` により算出して渡す（B3）。
 */
export interface CreateArtworkImageInput {
  artworkId: string;
  userId: string;
  r2Key: string;
  width?: number | null;
  height?: number | null;
  sortOrder: number;
}

/** 並び替えの永続化単位（id とその新しい sortOrder）。 */
export interface ArtworkImageSortUpdate {
  id: string;
  sortOrder: number;
}

/**
 * 画像リポジトリの契約。ルートはこれにのみ依存する。
 */
export interface ArtworkImageRepository {
  create(input: CreateArtworkImageInput): Promise<ArtworkImage>;
  findById(id: string): Promise<ArtworkImage | null>;
  /** 当該 artwork の画像を sortOrder 昇順で返す。 */
  listByArtwork(artworkId: string): Promise<ArtworkImage[]>;
  /** 削除できれば true、該当が無ければ false。 */
  delete(id: string): Promise<boolean>;
  /** 並び替え差分を一括反映する（変化分のみ）。 */
  updateSortOrders(updates: ArtworkImageSortUpdate[]): Promise<void>;
}

/**
 * drizzle 実装。`@artwork/database` の `createDb()` で得た db を渡す（生 neon/drizzle は呼ばない）。
 * 認可（所有者一致）はルート層で `assertOwner` により担保するため、ここでは行わない。
 */
export function createArtworkImageRepository(
  db: Database,
): ArtworkImageRepository {
  return {
    async create(input) {
      const [row] = await db
        .insert(artworkImage)
        .values({
          artworkId: input.artworkId,
          userId: input.userId,
          r2Key: input.r2Key,
          width: input.width ?? null,
          height: input.height ?? null,
          sortOrder: input.sortOrder,
        })
        .returning();
      if (!row) throw new Error("insert artwork_image returned no row");
      return toArtworkImage(row);
    },

    async findById(id) {
      const rows = await db
        .select()
        .from(artworkImage)
        .where(eq(artworkImage.id, id))
        .limit(1);
      const row = rows[0];
      return row ? toArtworkImage(row) : null;
    },

    async listByArtwork(artworkId) {
      const rows = await db
        .select()
        .from(artworkImage)
        .where(eq(artworkImage.artworkId, artworkId));
      return rows
        .map(toArtworkImage)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },

    async delete(id) {
      const rows = await db
        .delete(artworkImage)
        .where(eq(artworkImage.id, id))
        .returning({ id: artworkImage.id });
      return rows.length > 0;
    },

    async updateSortOrders(updates) {
      if (updates.length === 0) return;
      // 件数は画像枚数に比例して小さい想定。1 件ずつ更新する（トランザクション簡潔さ優先）。
      for (const u of updates) {
        await db
          .update(artworkImage)
          .set({ sortOrder: u.sortOrder })
          .where(eq(artworkImage.id, u.id));
      }
    },
  };
}

/** drizzle 行 → API 表現への変換（drift 防止のため一箇所に集約）。 */
function toArtworkImage(row: typeof artworkImage.$inferSelect): ArtworkImage {
  return {
    id: row.id,
    artworkId: row.artworkId,
    userId: row.userId,
    r2Key: row.r2Key,
    width: row.width,
    height: row.height,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}
