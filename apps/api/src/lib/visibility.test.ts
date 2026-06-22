import { describe, expect, it } from "vitest";

import { filterPublicArtworks, isArtworkPublic } from "./visibility";

/** テスト用の最小作品ファクトリ。 */
function artwork(overrides: {
  isPublic: boolean;
  isDraft: boolean;
  sortOrder?: number;
  id?: string;
}) {
  return {
    id: overrides.id ?? "a",
    sortOrder: overrides.sortOrder ?? 0,
    isPublic: overrides.isPublic,
    isDraft: overrides.isDraft,
  };
}

describe("isArtworkPublic", () => {
  it("isPublic かつ非 draft（isDraft=false）のみ true", () => {
    expect(isArtworkPublic({ isPublic: true, isDraft: false })).toBe(true);
  });

  it("draft（isDraft=true）かつ public は false", () => {
    expect(isArtworkPublic({ isPublic: true, isDraft: true })).toBe(false);
  });

  it("非 draft かつ非 public は false", () => {
    expect(isArtworkPublic({ isPublic: false, isDraft: false })).toBe(false);
  });

  it("draft かつ非 public は false", () => {
    expect(isArtworkPublic({ isPublic: false, isDraft: true })).toBe(false);
  });
});

describe("filterPublicArtworks", () => {
  it("非公開・下書きを除外し、公開作品のみ残す（FR-12）", () => {
    const input = [
      artwork({ id: "pub", isPublic: true, isDraft: false, sortOrder: 0 }),
      artwork({ id: "draft", isPublic: true, isDraft: true, sortOrder: 1 }),
      artwork({
        id: "private",
        isPublic: false,
        isDraft: false,
        sortOrder: 2,
      }),
      artwork({
        id: "both-off",
        isPublic: false,
        isDraft: true,
        sortOrder: 3,
      }),
    ];

    const result = filterPublicArtworks(input);

    expect(result.map((a) => a.id)).toEqual(["pub"]);
  });

  it("sortOrder 昇順に並べ替える（FR-13）", () => {
    const input = [
      artwork({ id: "c", isPublic: true, isDraft: false, sortOrder: 2 }),
      artwork({ id: "a", isPublic: true, isDraft: false, sortOrder: 0 }),
      artwork({ id: "b", isPublic: true, isDraft: false, sortOrder: 1 }),
    ];

    const result = filterPublicArtworks(input);

    expect(result.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("同一 sortOrder は元の相対順を保つ（安定ソート）", () => {
    const input = [
      artwork({ id: "x", isPublic: true, isDraft: false, sortOrder: 5 }),
      artwork({ id: "y", isPublic: true, isDraft: false, sortOrder: 5 }),
      artwork({ id: "z", isPublic: true, isDraft: false, sortOrder: 5 }),
    ];

    const result = filterPublicArtworks(input);

    expect(result.map((a) => a.id)).toEqual(["x", "y", "z"]);
  });

  it("元配列を破壊しない（不変）", () => {
    const input = [
      artwork({ id: "c", isPublic: true, isDraft: false, sortOrder: 2 }),
      artwork({ id: "a", isPublic: true, isDraft: false, sortOrder: 0 }),
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
