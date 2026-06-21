import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { artistProfile, artwork } from "@artwork/database/schema";

import {
  buildArtworkSearch,
  buildTrigramSearch,
  isBlankSearch,
  sanitizeSearchTerm,
} from "./search";

const dialect = new PgDialect();

describe("sanitizeSearchTerm", () => {
  it("trims surrounding whitespace", () => {
    expect(sanitizeSearchTerm("  hello  ")).toBe("hello");
  });

  it("collapses runs of internal whitespace into a single space", () => {
    expect(sanitizeSearchTerm("foo   bar\t\nbaz")).toBe("foo bar baz");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeSearchTerm("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(sanitizeSearchTerm("   \t\n  ")).toBe("");
  });

  it("escapes the LIKE wildcard %", () => {
    expect(sanitizeSearchTerm("50%")).toBe("50\\%");
  });

  it("escapes the LIKE single-char wildcard _", () => {
    expect(sanitizeSearchTerm("a_b")).toBe("a\\_b");
  });

  it("escapes the backslash escape character", () => {
    expect(sanitizeSearchTerm("a\\b")).toBe("a\\\\b");
  });

  it("escapes backslash before wildcards (backslash first, no double-escape)", () => {
    // input: backslash + percent  =>  \\\\ + \\%
    expect(sanitizeSearchTerm("\\%")).toBe("\\\\\\%");
  });

  it("preserves multibyte (Japanese) characters untouched", () => {
    expect(sanitizeSearchTerm("  日本語  作品 ")).toBe("日本語 作品");
  });

  it("caps the length at 100 characters (after trim)", () => {
    const long = "a".repeat(150);
    expect(sanitizeSearchTerm(long)).toHaveLength(100);
  });
});

describe("isBlankSearch", () => {
  it("is true for empty string", () => {
    expect(isBlankSearch("")).toBe(true);
  });

  it("is true for whitespace only", () => {
    expect(isBlankSearch("   \t ")).toBe(true);
  });

  it("is false when there is a real term", () => {
    expect(isBlankSearch("  art ")).toBe(false);
  });
});

describe("buildTrigramSearch", () => {
  it("returns undefined for a blank term", () => {
    expect(buildTrigramSearch([artwork.title], "")).toBeUndefined();
    expect(buildTrigramSearch([artwork.title], "   ")).toBeUndefined();
  });

  it("returns undefined when no columns are given", () => {
    expect(buildTrigramSearch([], "art")).toBeUndefined();
  });

  it("builds an ILIKE condition for a single column", () => {
    const condition = buildTrigramSearch([artwork.title], "art");
    expect(condition).toBeDefined();
    const query = dialect.sqlToQuery(condition!);
    expect(query.sql.toLowerCase()).toContain("ilike");
    // single column => no OR
    expect(query.sql.toLowerCase()).not.toContain(" or ");
    // term passed as a parameter, wrapped with the LIKE wildcards
    expect(query.params).toContain("%art%");
  });

  it("ORs an ILIKE condition across multiple columns", () => {
    const condition = buildTrigramSearch(
      [artwork.title, artwork.description, artistProfile.displayName],
      "art",
    );
    expect(condition).toBeDefined();
    const query = dialect.sqlToQuery(condition!);
    const lower = query.sql.toLowerCase();
    // three columns => two OR separators
    expect(lower.match(/ or /g) ?? []).toHaveLength(2);
    expect((lower.match(/ilike/g) ?? []).length).toBe(3);
    // one wildcard-wrapped parameter per column (no string concatenation)
    const wildcardParams = query.params.filter((p) => p === "%art%");
    expect(wildcardParams).toHaveLength(3);
  });

  it("passes the escaped term as a parameter (no SQL-injectable concatenation)", () => {
    const condition = buildTrigramSearch([artwork.title], "50%_x");
    const query = dialect.sqlToQuery(condition!);
    // escaped term must appear as a bound parameter, never inlined in the SQL
    expect(query.params).toContain("%50\\%\\_x%");
    expect(query.sql).not.toContain("50%");
  });
});

describe("buildArtworkSearch (convenience wrapper)", () => {
  it("searches title + description by default", () => {
    const condition = buildArtworkSearch("art");
    expect(condition).toBeDefined();
    const query = dialect.sqlToQuery(condition!);
    expect((query.sql.toLowerCase().match(/ilike/g) ?? []).length).toBe(2);
    expect(query.params.filter((p) => p === "%art%")).toHaveLength(2);
  });

  it("returns undefined for a blank term", () => {
    expect(buildArtworkSearch("  ")).toBeUndefined();
  });
});
