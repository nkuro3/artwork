import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// =============================================================================
// Better Auth tables (canonical Drizzle schema)
// -----------------------------------------------------------------------------
// Column names / types match the schema Better Auth's Drizzle adapter expects
// (verified against @better-auth/core 1.6.20 `getAuthTables`, the source the
// `@better-auth/cli generate` command derives the default Drizzle schema from).
// Better Auth uses camelCase column names and a text `id` primary key by
// default; we keep those exactly so the adapter / CLI stay in sync (C1).
// Auth tables live in this same schema per the DB convention (no separate
// schema). Do NOT rename these columns.
// =============================================================================

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// =============================================================================
// Application tables
// -----------------------------------------------------------------------------
// snake_case columns. uuid PKs default to PostgreSQL's built-in
// gen_random_uuid(). Owner column (`user_id`) + FK + index; authorization is
// enforced in the API app layer.
// =============================================================================

// 公開状態。status（作品自体の状態）とは独立した軸。
export const artworkPublicStatus = pgEnum("artwork_public_status", [
  "draft",
  "public",
  "archived",
]);

// 作品の状態。NULL = 未設定。
export const artworkStatus = pgEnum("artwork_status", [
  "in_progress",
  "available",
  "sold",
]);

export const artwork = pgTable(
  "artwork",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    // 作品の状態（制作中 / 販売可 / 売約済）。NULL = 未設定。
    status: artworkStatus("status"),
    // --- カタログ属性（すべて任意入力） ---
    // 画材・素材（例: 油彩、キャンバス）。将来 enum 化候補の仮文字列。
    medium: text("medium"),
    // 作品種別（例: 絵画、彫刻、写真）。将来 enum 化候補の仮文字列。
    artType: text("art_type"),
    // 状態（例: 新品、良好、経年劣化あり）。将来 enum 化候補の仮文字列。
    condition: text("condition"),
    // 寸法 H×W×D（mm 整数）と重量（g 整数）。
    heightMm: integer("height_mm"),
    widthMm: integer("width_mm"),
    depthMm: integer("depth_mm"),
    weightG: integer("weight_g"),
    // 公開状態: draft（下書き）/ public（公開）/ archived（アーカイブ）。
    publicStatus: artworkPublicStatus("public_status")
      .notNull()
      .default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("artwork_user_id_idx").on(t.userId)],
);

export const artworkImage = pgTable(
  "artwork_image",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // NULL = 未紐付け（アップロード直後の未保存、または編集で外された孤児）。
    // バッチのクリーンアップは artwork_id IS NULL で対象取得。
    // 作品削除時は cascade で画像行も削除（R2 オブジェクトの掃除はアプリ層）。
    artworkId: uuid("artwork_id").references(() => artwork.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("artwork_image_artwork_id_idx").on(t.artworkId),
    index("artwork_image_user_id_idx").on(t.userId),
    // 孤児画像クリーンアップバッチ用の部分インデックス。
    index("artwork_image_unattached_idx")
      .on(t.createdAt)
      .where(sql`${t.artworkId} is null`),
  ],
);
