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
// gen_random_uuid() (PG18). Owner columns (`user_id`) + FK + index follow
// ADR D8 (authorization enforced in the API app layer).
// =============================================================================

export const artworkStatus = pgEnum("artwork_status", ["draft", "published"]);

export const artistProfile = pgTable("artist_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique() // one profile per user
    .references(() => user.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const artwork = pgTable(
  "artwork",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // ADR D8: owner column for app-layer authorization.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    artistProfileId: uuid("artist_profile_id")
      .notNull()
      .references(() => artistProfile.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: artworkStatus("status").notNull().default("draft"),
    // Draft lifecycle (spec 02 「下書きモデル」). New artworks start as drafts;
    // `登録` flips this to false. Independent of `status` and `isPublic`.
    isDraft: boolean("is_draft").notNull().default(true),
    isPublic: boolean("is_public").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("artwork_user_id_idx").on(t.userId),
    index("artwork_artist_profile_id_idx").on(t.artistProfileId),
  ],
);

export const artworkImage = pgTable(
  "artwork_image",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artworkId: uuid("artwork_id")
      .notNull()
      // FR-07: deleting an artwork removes its images.
      .references(() => artwork.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("artwork_image_artwork_id_idx").on(t.artworkId),
    index("artwork_image_user_id_idx").on(t.userId),
  ],
);
