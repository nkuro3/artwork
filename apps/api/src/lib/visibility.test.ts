import { describe, expect, it } from "vitest";

import {
  filterPublicArtworks,
  isArtworkPublic,
  type ArtworkStatus,
} from "./visibility";

/** テスト用の最小作品ファクトリ。 */
function artwork(overrides: {
  isPublic: boolean;
  status: ArtworkStatus;
  sortOrder?: number;
  id?: string;
}) {
  return {
    id: overrides.id ?? "a",
    sortOrder: overrides.sortOrder ?? 0,
    isPublic: overrides.isPublic,
    status: overrides.status,
  };
}

describe("isArtworkPublic", () => {
  it("published かつ public は true", () => {
    expect(isArtworkPublic({ isPublic: true, status: "published" })).toBe(true);
  });

  it("draft かつ public は false（未公開ステータス）", () => {
    expect(isArtworkPublic({ isPublic: true, status: "draft" })).toBe(false);
  });

  it("published かつ非 public は false", () => {
    expect(isArtworkPublic({ isPublic: false, status: "published" })).toBe(
      false,
    );
  });

  it("draft かつ非 public は false", () => {
    expect(isArtworkPublic({ isPublic: false, status: "draft" })).toBe(false);
  });
});

describe("filterPublicArtworks", () => {
  it("非公開・下書きを除外し、公開作品のみ残す（FR-12）", () => {
    const input = [
      artwork({ id: "pub", isPublic: true, status: "published", sortOrder: 0 }),
      artwork({ id: "draft", isPublic: true, status: "draft", sortOrder: 1 }),
      artwork({
        id: "private",
        isPublic: false,
        status: "published",
        sortOrder: 2,
      }),
      artwork({
        id: "both-off",
        isPublic: false,
        status: "draft",
        sortOrder: 3,
      }),
    ];

    const result = filterPublicArtworks(input);

    expect(result.map((a) => a.id)).toEqual(["pub"]);
  });

  it("sortOrder 昇順に並べ替える（FR-13）", () => {
    const input = [
      artwork({ id: "c", isPublic: true, status: "published", sortOrder: 2 }),
      artwork({ id: "a", isPublic: true, status: "published", sortOrder: 0 }),
      artwork({ id: "b", isPublic: true, status: "published", sortOrder: 1 }),
    ];

    const result = filterPublicArtworks(input);

    expect(result.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("同一 sortOrder は元の相対順を保つ（安定ソート）", () => {
    const input = [
      artwork({ id: "x", isPublic: true, status: "published", sortOrder: 5 }),
      artwork({ id: "y", isPublic: true, status: "published", sortOrder: 5 }),
      artwork({ id: "z", isPublic: true, status: "published", sortOrder: 5 }),
    ];

    const result = filterPublicArtworks(input);

    expect(result.map((a) => a.id)).toEqual(["x", "y", "z"]);
  });

  it("元配列を破壊しない（不変）", () => {
    const input = [
      artwork({ id: "c", isPublic: true, status: "published", sortOrder: 2 }),
      artwork({ id: "a", isPublic: true, status: "published", sortOrder: 0 }),
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
