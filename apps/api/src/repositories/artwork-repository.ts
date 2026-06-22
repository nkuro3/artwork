/**
 * C2 作品リポジトリ層（FR-05 / FR-07 / FR-08 / FR-09）。
 *
 * ルートは `ArtworkRepository` インターフェースに依存し、テストでは in-memory
 * モックを注入する（DB / ネットワーク非依存）。drizzle 実装は
 * `createArtworkRepository(db)` として提供するが、実 DB 接続が要るため
 * ユニットテストはしない（型のみ担保 / 実 DB 統合は E2）。
 */

import { eq, sql } from "drizzle-orm";
import type { createDb } from "@artwork/database";
import { artwork, artworkImage } from "@artwork/database/schema";
import type { ArtworkStatus } from "../lib/visibility";

/** drizzle の DB ハンドル型（`createDb()` の戻り値）。 */
type Database = ReturnType<typeof createDb>;

/**
 * 永続化された作品行（API 表現）。
 * スキーマ型をそのまま web へ漏らさず（ADR D5）、CRUD に必要な最小集合を公開する。
 */
export interface Artwork {
  id: string;
  userId: string;
  artistProfileId: string;
  title: string;
  description: string | null;
  status: ArtworkStatus;
  isPublic: boolean;
  /**
   * 下書きフラグ（02 仕様「下書きモデル」）。新規作成時は true。
   * 公開条件は `isPublic && !isDraft`（status は関与しない）。
   */
  isDraft: boolean;
  sortOrder: number;
  /**
   * 先頭画像（sort_order 昇順の先頭 1 枚）の R2 キー。一覧（listByUser）でのみ設定し、
   * ルート層で B5 `thumbnailUrl` の素にする。画像なし=null。CRUD 単体（create/findById/
   * update）では設定されない（undefined）ため optional。スキーマ型は web に漏らさない（ADR D5）。
   */
  thumbnailR2Key?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 作品作成の入力。`userId` はサーバー側で付与される（クライアント値は信用しない / SEC-01）。
 * 省略可能な項目はリポジトリ側で既定値（status='draft' / isPublic=false / isDraft=true /
 * sortOrder=0）を補う。
 */
export interface CreateArtworkInput {
  userId: string;
  artistProfileId: string;
  title: string;
  description?: string | null;
  status?: ArtworkStatus;
  isPublic?: boolean;
  /** 未指定なら下書き（true）として作成する。 */
  isDraft?: boolean;
  sortOrder?: number;
}

/**
 * 作品更新のパッチ。指定したフィールドのみ更新する（部分更新）。
 * `userId` / `artistProfileId` は所有権に関わるため変更不可（含めない）。
 */
export interface UpdateArtworkPatch {
  title?: string;
  description?: string | null;
  status?: ArtworkStatus;
  isPublic?: boolean;
  isDraft?: boolean;
  sortOrder?: number;
}

/**
 * 作品リポジトリの契約。ルートはこれにのみ依存する。
 */
export interface ArtworkRepository {
  create(input: CreateArtworkInput): Promise<Artwork>;
  findById(id: string): Promise<Artwork | null>;
  listByUser(userId: string): Promise<Artwork[]>;
  /** 該当 id が無ければ null。 */
  update(id: string, patch: UpdateArtworkPatch): Promise<Artwork | null>;
  /** 削除できれば true、該当が無ければ false。 */
  delete(id: string): Promise<boolean>;
}

/**
 * drizzle 実装。`@artwork/database` の `createDb()` で得た db を渡す（生 neon/drizzle は呼ばない）。
 * 認可（所有者一致）はルート層で `assertOwner` により担保するため、ここでは行わない。
 */
export function createArtworkRepository(db: Database): ArtworkRepository {
  return {
    async create(input) {
      const [row] = await db
        .insert(artwork)
        .values({
          userId: input.userId,
          artistProfileId: input.artistProfileId,
          title: input.title,
          description: input.description ?? null,
          status: input.status ?? "draft",
          isPublic: input.isPublic ?? false,
          isDraft: input.isDraft ?? true,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      if (!row) throw new Error("insert artwork returned no row");
      return toArtwork(row);
    },

    async findById(id) {
      const rows = await db
        .select()
        .from(artwork)
        .where(eq(artwork.id, id))
        .limit(1);
      const row = rows[0];
      return row ? toArtwork(row) : null;
    },

    async listByUser(userId) {
      // 先頭画像（sort_order 昇順の先頭 1 件）の r2_key を相関サブクエリで引く
      // （C4 portfolio / C5 search と同方針）。画像なしは null。
      const firstImageKey = sql<string | null>`(
        select ${artworkImage.r2Key}
        from ${artworkImage}
        where ${artworkImage.artworkId} = ${artwork.id}
        order by ${artworkImage.sortOrder} asc
        limit 1
      )`;

      const rows = await db
        .select({
          id: artwork.id,
          userId: artwork.userId,
          artistProfileId: artwork.artistProfileId,
          title: artwork.title,
          description: artwork.description,
          status: artwork.status,
          isPublic: artwork.isPublic,
          isDraft: artwork.isDraft,
          sortOrder: artwork.sortOrder,
          createdAt: artwork.createdAt,
          updatedAt: artwork.updatedAt,
          thumbnailR2Key: firstImageKey,
        })
        .from(artwork)
        .where(eq(artwork.userId, userId));

      return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        artistProfileId: row.artistProfileId,
        title: row.title,
        description: row.description,
        status: row.status,
        isPublic: row.isPublic,
        isDraft: row.isDraft,
        sortOrder: row.sortOrder,
        thumbnailR2Key: row.thumbnailR2Key,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    },

    async update(id, patch) {
      const [row] = await db
        .update(artwork)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(artwork.id, id))
        .returning();
      return row ? toArtwork(row) : null;
    },

    async delete(id) {
      const rows = await db
        .delete(artwork)
        .where(eq(artwork.id, id))
        .returning({ id: artwork.id });
      return rows.length > 0;
    },
  };
}

/** drizzle 行 → API 表現への変換（drift 防止のため一箇所に集約）。 */
function toArtwork(row: typeof artwork.$inferSelect): Artwork {
  return {
    id: row.id,
    userId: row.userId,
    artistProfileId: row.artistProfileId,
    title: row.title,
    description: row.description,
    status: row.status,
    isPublic: row.isPublic,
    isDraft: row.isDraft,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
