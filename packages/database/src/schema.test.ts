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
