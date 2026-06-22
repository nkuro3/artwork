import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "./schema";

const columnNames = (table: Parameters<typeof getTableColumns>[0]) =>
  Object.values(getTableColumns(table)).map((c) => c.name).sort();

describe("Better Auth tables (canonical Drizzle schema, camelCase columns)", () => {
  it("user table has the canonical columns", () => {
    expect(columnNames(schema.user)).toEqual(
      [
        "createdAt",
        "email",
        "emailVerified",
        "id",
        "image",
        "name",
        "updatedAt",
      ].sort(),
    );
  });

  it("session table has the canonical columns", () => {
    expect(columnNames(schema.session)).toEqual(
      [
        "createdAt",
        "expiresAt",
        "id",
        "ipAddress",
        "token",
        "updatedAt",
        "userAgent",
        "userId",
      ].sort(),
    );
  });

  it("account table has the canonical columns", () => {
    expect(columnNames(schema.account)).toEqual(
      [
        "accessToken",
        "accessTokenExpiresAt",
        "accountId",
        "createdAt",
        "id",
        "idToken",
        "password",
        "providerId",
        "refreshToken",
        "refreshTokenExpiresAt",
        "scope",
        "updatedAt",
        "userId",
      ].sort(),
    );
  });

  it("verification table has the canonical columns", () => {
    expect(columnNames(schema.verification)).toEqual(
      [
        "createdAt",
        "expiresAt",
        "id",
        "identifier",
        "updatedAt",
        "value",
      ].sort(),
    );
  });

  it("user.email is unique and not null", () => {
    const cols = getTableColumns(schema.user);
    expect(cols.email.isUnique).toBe(true);
    expect(cols.email.notNull).toBe(true);
  });

  it("session.token is unique", () => {
    expect(getTableColumns(schema.session).token.isUnique).toBe(true);
  });

  it("session.userId references user.id (cascade)", () => {
    const { foreignKeys } = getTableConfig(schema.session);
    const fk = foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "userId"),
    );
    expect(fk).toBeDefined();
    expect(fk!.onDelete).toBe("cascade");
    expect(fk!.reference().foreignTable).toBe(schema.user);
  });
});

describe("artist_profile table", () => {
  it("has the expected columns", () => {
    expect(columnNames(schema.artistProfile)).toEqual(
      [
        "bio",
        "created_at",
        "display_name",
        "id",
        "slug",
        "updated_at",
        "user_id",
      ].sort(),
    );
  });

  it("id is the primary key with a default (gen_random_uuid)", () => {
    const cols = getTableColumns(schema.artistProfile);
    expect(cols.id.primary).toBe(true);
    expect(cols.id.hasDefault).toBe(true);
  });

  it("user_id is unique (one profile per user) and not null", () => {
    const cols = getTableColumns(schema.artistProfile);
    expect(cols.userId.notNull).toBe(true);
    expect(cols.userId.isUnique).toBe(true);
  });

  it("slug is unique and not null", () => {
    const cols = getTableColumns(schema.artistProfile);
    expect(cols.slug.isUnique).toBe(true);
    expect(cols.slug.notNull).toBe(true);
  });

  it("display_name is not null, bio is nullable", () => {
    const cols = getTableColumns(schema.artistProfile);
    expect(cols.displayName.notNull).toBe(true);
    expect(cols.bio.notNull).toBe(false);
  });

  it("user_id references user.id", () => {
    const { foreignKeys } = getTableConfig(schema.artistProfile);
    const fk = foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "user_id"),
    );
    expect(fk).toBeDefined();
    expect(fk!.reference().foreignTable).toBe(schema.user);
  });
});

describe("artwork table", () => {
  it("has the expected columns", () => {
    expect(columnNames(schema.artwork)).toEqual(
      [
        "artist_profile_id",
        "created_at",
        "description",
        "id",
        "is_draft",
        "is_public",
        "sort_order",
        "status",
        "title",
        "updated_at",
        "user_id",
      ].sort(),
    );
  });

  it("id is the primary key with a default", () => {
    const cols = getTableColumns(schema.artwork);
    expect(cols.id.primary).toBe(true);
    expect(cols.id.hasDefault).toBe(true);
  });

  it("user_id is not null and indexed (ADR D8 owner column)", () => {
    const cols = getTableColumns(schema.artwork);
    expect(cols.userId.notNull).toBe(true);
    const { indexes } = getTableConfig(schema.artwork);
    const hasUserIdIndex = indexes.some((i) =>
      i.config.columns.some((c) => "name" in c && c.name === "user_id"),
    );
    expect(hasUserIdIndex).toBe(true);
  });

  it("artist_profile_id is not null and indexed", () => {
    const cols = getTableColumns(schema.artwork);
    expect(cols.artistProfileId.notNull).toBe(true);
    const { indexes } = getTableConfig(schema.artwork);
    const hasIndex = indexes.some((i) =>
      i.config.columns.some(
        (c) => "name" in c && c.name === "artist_profile_id",
      ),
    );
    expect(hasIndex).toBe(true);
  });

  it("status defaults to draft and is not null", () => {
    const cols = getTableColumns(schema.artwork);
    expect(cols.status.notNull).toBe(true);
    expect(cols.status.default).toBe("draft");
    expect(cols.status.enumValues).toEqual(["draft", "published"]);
  });

  it("is_public is a boolean default false, not null", () => {
    const cols = getTableColumns(schema.artwork);
    expect(cols.isPublic.notNull).toBe(true);
    expect(cols.isPublic.default).toBe(false);
  });

  it("is_draft is a boolean default true, not null (new artworks are drafts)", () => {
    const cols = getTableColumns(schema.artwork);
    expect(cols.isDraft.notNull).toBe(true);
    expect(cols.isDraft.default).toBe(true);
    expect(cols.isDraft.name).toBe("is_draft");
  });

  it("sort_order is an integer default 0, not null", () => {
    const cols = getTableColumns(schema.artwork);
    expect(cols.sortOrder.notNull).toBe(true);
    expect(cols.sortOrder.default).toBe(0);
  });

  it("title not null, description nullable", () => {
    const cols = getTableColumns(schema.artwork);
    expect(cols.title.notNull).toBe(true);
    expect(cols.description.notNull).toBe(false);
  });
});

describe("artwork_image table", () => {
  it("has the expected columns", () => {
    expect(columnNames(schema.artworkImage)).toEqual(
      [
        "artwork_id",
        "created_at",
        "height",
        "id",
        "r2_key",
        "sort_order",
        "user_id",
        "width",
      ].sort(),
    );
  });

  it("id is the primary key with a default", () => {
    const cols = getTableColumns(schema.artworkImage);
    expect(cols.id.primary).toBe(true);
    expect(cols.id.hasDefault).toBe(true);
  });

  it("artwork_id references artwork.id with on delete cascade (FR-07)", () => {
    const { foreignKeys } = getTableConfig(schema.artworkImage);
    const fk = foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "artwork_id"),
    );
    expect(fk).toBeDefined();
    expect(fk!.onDelete).toBe("cascade");
    expect(fk!.reference().foreignTable).toBe(schema.artwork);
  });

  it("artwork_id and user_id are not null and indexed", () => {
    const cols = getTableColumns(schema.artworkImage);
    expect(cols.artworkId.notNull).toBe(true);
    expect(cols.userId.notNull).toBe(true);
    const { indexes } = getTableConfig(schema.artworkImage);
    const indexed = (name: string) =>
      indexes.some((i) =>
        i.config.columns.some((c) => "name" in c && c.name === name),
      );
    expect(indexed("artwork_id")).toBe(true);
    expect(indexed("user_id")).toBe(true);
  });

  it("r2_key not null; width/height nullable", () => {
    const cols = getTableColumns(schema.artworkImage);
    expect(cols.r2Key.notNull).toBe(true);
    expect(cols.width.notNull).toBe(false);
    expect(cols.height.notNull).toBe(false);
  });

  it("user_id references user.id", () => {
    const { foreignKeys } = getTableConfig(schema.artworkImage);
    const fk = foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "user_id"),
    );
    expect(fk).toBeDefined();
    expect(fk!.reference().foreignTable).toBe(schema.user);
  });
});
