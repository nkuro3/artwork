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

describe("artwork table", () => {
  it("has the expected columns (status and public_status are separate axes)", () => {
    expect(columnNames(schema.artwork)).toEqual(
      [
        "art_type",
        "condition",
        "created_at",
        "depth_mm",
        "description",
        "height_mm",
        "id",
        "medium",
        "public_status",
        "status",
        "title",
        "updated_at",
        "user_id",
        "weight_g",
        "width_mm",
      ].sort(),
    );
  });

  it("status enum = in_progress/available/sold, nullable (NULL = unset)", () => {
    const cols = getTableColumns(schema.artwork);
    expect(cols.status.notNull).toBe(false);
    expect(cols.status.default).toBeUndefined();
    expect(cols.status.enumValues).toEqual([
      "in_progress",
      "available",
      "sold",
    ]);
  });

  it("public_status enum = draft/public/archived, not null, default draft", () => {
    const cols = getTableColumns(schema.artwork);
    expect(cols.publicStatus.notNull).toBe(true);
    expect(cols.publicStatus.default).toBe("draft");
    expect(cols.publicStatus.enumValues).toEqual([
      "draft",
      "public",
      "archived",
    ]);
  });


  it("catalog attributes are all nullable", () => {
    const cols = getTableColumns(schema.artwork);
    for (const key of [
      "medium",
      "artType",
      "condition",
      "heightMm",
      "widthMm",
      "depthMm",
      "weightG",
    ] as const) {
      expect(cols[key].notNull).toBe(false);
    }
  });

  it("user_id references user.id (cascade) and is indexed", () => {
    const { foreignKeys, indexes } = getTableConfig(schema.artwork);
    const fk = foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "user_id"),
    );
    expect(fk).toBeDefined();
    expect(fk!.onDelete).toBe("cascade");
    expect(fk!.reference().foreignTable).toBe(schema.user);
    const hasIndex = indexes.some((i) =>
      i.config.columns.some((c) => "name" in c && c.name === "user_id"),
    );
    expect(hasIndex).toBe(true);
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
        "sort_order",
        "storage_key",
        "updated_at",
        "user_id",
        "width",
      ].sort(),
    );
  });

  it("artwork_id references artwork.id with on delete cascade and is indexed", () => {
    const { foreignKeys, indexes } = getTableConfig(schema.artworkImage);
    const fk = foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "artwork_id"),
    );
    expect(fk).toBeDefined();
    expect(fk!.onDelete).toBe("cascade");
    expect(fk!.reference().foreignTable).toBe(schema.artwork);
    const hasIndex = indexes.some((i) =>
      i.config.columns.some((c) => "name" in c && c.name === "artwork_id"),
    );
    expect(hasIndex).toBe(true);
  });


  it("artwork_id is nullable (NULL = unattached/orphaned image)", () => {
    const cols = getTableColumns(schema.artworkImage);
    expect(cols.artworkId.notNull).toBe(false);
  });

  it("has a partial index for the unattached cleanup query", () => {
    const { indexes } = getTableConfig(schema.artworkImage);
    const idx = indexes.find(
      (i) => i.config.name === "artwork_image_unattached_idx",
    );
    expect(idx).toBeDefined();
    expect(idx!.config.where).toBeDefined();
  });

  it("storage_key not null; width/height nullable; sort_order default 0", () => {
    const cols = getTableColumns(schema.artworkImage);
    expect(cols.storageKey.notNull).toBe(true);
    expect(cols.width.notNull).toBe(false);
    expect(cols.height.notNull).toBe(false);
    expect(cols.sortOrder.notNull).toBe(true);
    expect(cols.sortOrder.default).toBe(0);
  });
});
