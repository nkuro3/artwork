import { describe, expect, it } from "vitest";

import type { ArtworkStatus } from "./visibility";
import { filterPublicArtworks, isArtworkPublic } from "./visibility";

/** テスト用の最小作品ファクトリ。 */
function artwork(overrides: {
  status: ArtworkStatus;
  sortOrder?: number;
  id?: string;
}) {
  return {
    id: overrides.id ?? "a",
    sortOrder: overrides.sortOrder ?? 0,
    status: overrides.status,
  };
}

describe("isArtworkPublic", () => {
  it("status='published' のみ true", () => {
    expect(isArtworkPublic({ status: "published" })).toBe(true);
  });

  it("status='draft' は false", () => {
    expect(isArtworkPublic({ status: "draft" })).toBe(false);
  });

  it("status='archived' は false", () => {
    expect(isArtworkPublic({ status: "archived" })).toBe(false);
  });
});

describe("filterPublicArtworks", () => {
  it("draft / archived を除外し、published のみ残す（FR-12）", () => {
    const input = [
      artwork({ id: "pub", status: "published", sortOrder: 0 }),
      artwork({ id: "draft", status: "draft", sortOrder: 1 }),
      artwork({ id: "archived", status: "archived", sortOrder: 2 }),
    ];

    const result = filterPublicArtworks(input);

    expect(result.map((a) => a.id)).toEqual(["pub"]);
  });

  it("sortOrder 昇順に並べ替える（FR-13）", () => {
    const input = [
      artwork({ id: "c", status: "published", sortOrder: 2 }),
      artwork({ id: "a", status: "published", sortOrder: 0 }),
      artwork({ id: "b", status: "published", sortOrder: 1 }),
    ];

    const result = filterPublicArtworks(input);

    expect(result.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("同一 sortOrder は元の相対順を保つ（安定ソート）", () => {
    const input = [
      artwork({ id: "x", status: "published", sortOrder: 5 }),
      artwork({ id: "y", status: "published", sortOrder: 5 }),
      artwork({ id: "z", status: "published", sortOrder: 5 }),
    ];

    const result = filterPublicArtworks(input);

    expect(result.map((a) => a.id)).toEqual(["x", "y", "z"]);
  });

  it("元配列を破壊しない（不変）", () => {
    const input = [
      artwork({ id: "c", status: "published", sortOrder: 2 }),
      artwork({ id: "a", status: "published", sortOrder: 0 }),
    ] as const;
    const snapshot = input.map((a) => a.id);

    const result = filterPublicArtworks(input);

    expect(input.map((a) => a.id)).toEqual(snapshot);
    expect(result).not.toBe(input);
  });

  it("空配列は空配列を返す", () => {
    expect(filterPublicArtworks([])).toEqual([]);
  });
});
