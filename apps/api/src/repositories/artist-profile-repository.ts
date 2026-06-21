/**
 * C7 アーティストプロフィールリポジトリ層（FR-03 初期化 / FR-11 公開 URL slug）。
 *
 * ルートは `ArtistProfileRepository` インターフェースにのみ依存し、テストでは
 * in-memory モックを注入する（DB / ネットワーク非依存）。drizzle 実装は
 * `createArtistProfileRepository(db)` として提供するが、実 DB 接続が要るため
 * ユニットテストはしない（型のみ担保 / 実 DB 統合は E2）。
 */

import { and, eq, ne } from "drizzle-orm";
import type { createDb } from "@artwork/database";
import { artistProfile } from "@artwork/database/schema";

/** drizzle の DB ハンドル型（`createDb()` の戻り値）。 */
type Database = ReturnType<typeof createDb>;

/**
 * 永続化されたアーティストプロフィール（API 表現 / DTO）。
 * スキーマ型をそのまま web へ漏らさず（ADR D5）、設定 UI（D4）に必要な最小集合を公開する。
 *
 * 注: スキーマには `is_public` 列が無い（artist_profile は常に slug で公開される）。
 * FR-10 の可視性は artwork 側で担保するため、ここでは将来の拡張余地として
 * `isPublic` を DTO に持たせ、当面は常に true を返す（PATCH では受理して保持しない）。
 */
export interface ArtistProfile {
  id: string;
  userId: string;
  slug: string;
  displayName: string;
  bio: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * プロフィール作成の入力。`userId` はサーバー側で付与される（クライアント値は信用しない / SEC-01）。
 * `slug` は仮値（`generateProvisionalSlug`）または設定変更後の確定値。
 * `displayName` 省略時はリポジトリ側で既定値を補う。
 */
export interface CreateArtistProfileInput {
  userId: string;
  slug: string;
  displayName?: string;
  bio?: string | null;
}

/**
 * プロフィール更新のパッチ。指定したフィールドのみ更新する（部分更新）。
 * `userId` は所有権に関わるため変更不可（含めない）。
 */
export interface UpdateArtistProfilePatch {
  slug?: string;
  displayName?: string;
  bio?: string | null;
}

/**
 * プロフィールリポジトリの契約。ルートはこれにのみ依存する。
 */
export interface ArtistProfileRepository {
  /** 当該ユーザーのプロフィール。無ければ null。 */
  getByUserId(userId: string): Promise<ArtistProfile | null>;
  create(input: CreateArtistProfileInput): Promise<ArtistProfile>;
  /** 該当ユーザーが無ければ null。 */
  updateByUserId(
    userId: string,
    patch: UpdateArtistProfilePatch,
  ): Promise<ArtistProfile | null>;
  /**
   * slug が（`exceptUserId` 以外の）誰かに使われていれば true。
   * 自分自身の現在の slug は衝突とみなさない（更新で自分の slug を据え置けるように）。
   */
  isSlugTaken(slug: string, exceptUserId: string): Promise<boolean>;
}

/**
 * drizzle 実装。`@artwork/database` の `createDb()` で得た db を渡す（生 neon/drizzle は呼ばない）。
 * 認可（所有者一致）はルート層で `userId` 一致を担保するため、ここでは行わない。
 */
export function createArtistProfileRepository(
  db: Database,
): ArtistProfileRepository {
  return {
    async getByUserId(userId) {
      const rows = await db
        .select()
        .from(artistProfile)
        .where(eq(artistProfile.userId, userId))
        .limit(1);
      const row = rows[0];
      return row ? toArtistProfile(row) : null;
    },

    async create(input) {
      const [row] = await db
        .insert(artistProfile)
        .values({
          userId: input.userId,
          slug: input.slug,
          displayName: input.displayName ?? "",
          bio: input.bio ?? null,
        })
        .returning();
      if (!row) throw new Error("insert artist_profile returned no row");
      return toArtistProfile(row);
    },

    async updateByUserId(userId, patch) {
      const set: Partial<typeof artistProfile.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (patch.slug !== undefined) set.slug = patch.slug;
      if (patch.displayName !== undefined) set.displayName = patch.displayName;
      if (patch.bio !== undefined) set.bio = patch.bio;

      const [row] = await db
        .update(artistProfile)
        .set(set)
        .where(eq(artistProfile.userId, userId))
        .returning();
      return row ? toArtistProfile(row) : null;
    },

    async isSlugTaken(slug, exceptUserId) {
      const rows = await db
        .select({ id: artistProfile.id })
        .from(artistProfile)
        .where(
          and(
            eq(artistProfile.slug, slug),
            ne(artistProfile.userId, exceptUserId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
  };
}

/** drizzle 行 → API 表現への変換（drift 防止のため一箇所に集約）。 */
function toArtistProfile(
  row: typeof artistProfile.$inferSelect,
): ArtistProfile {
  return {
    id: row.id,
    userId: row.userId,
    slug: row.slug,
    displayName: row.displayName,
    bio: row.bio,
    // スキーマに is_public 列が無いため当面は常に公開扱い（DTO 互換のための既定値）。
    isPublic: true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
