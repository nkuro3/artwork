import { describe, expect, it } from "vitest";
import {
  moveItem,
  nextSortOrder,
  normalizeSortOrders,
  reorder,
} from "./sort-order";

// B3 sort_order（FR-09 作品表示順 / FR-13 ポートフォリオ並び / FR-06 画像並び替え）。
// 純ロジックのユニットテスト。DB アクセスはせず、入出力は配列のみ。
describe("sort-order", () => {
  const items = [
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 },
    { id: "d", sortOrder: 3 },
  ] as const;

  const ids = (xs: readonly { id: string }[]): string[] => xs.map((x) => x.id);

  describe("moveItem", () => {
    it("前から後ろへ移動する", () => {
      expect(ids(moveItem(items, "a", 2))).toEqual(["b", "c", "a", "d"]);
    });

    it("後ろから前へ移動する", () => {
      expect(ids(moveItem(items, "d", 0))).toEqual(["d", "a", "b", "c"]);
    });

    it("同じ位置への移動は順序を変えない", () => {
      expect(ids(moveItem(items, "b", 1))).toEqual(["a", "b", "c", "d"]);
    });

    it("末尾へ移動する", () => {
      expect(ids(moveItem(items, "b", 3))).toEqual(["a", "c", "d", "b"]);
    });

    it("toIndex が上限を超える場合は末尾にクランプする", () => {
      expect(ids(moveItem(items, "a", 99))).toEqual(["b", "c", "d", "a"]);
    });

    it("toIndex が負値の場合は先頭にクランプする", () => {
      expect(ids(moveItem(items, "d", -5))).toEqual(["d", "a", "b", "c"]);
    });

    it("存在しない id はそのまま（同等の）配列を返す", () => {
      expect(ids(moveItem(items, "zzz", 0))).toEqual(["a", "b", "c", "d"]);
    });

    it("元配列を破壊しない（不変）", () => {
      const source = [...items];
      const snapshot = ids(source);
      moveItem(source, "a", 3);
      expect(ids(source)).toEqual(snapshot);
    });

    it("新しい配列インスタンスを返す", () => {
      const result = moveItem(items, "a", 0);
      expect(result).not.toBe(items);
    });

    it("空配列でも安全に動く", () => {
      expect(moveItem([], "a", 0)).toEqual([]);
    });
  });

  describe("normalizeSortOrders", () => {
    it("並び順に従って 0..n-1 の連番を割り当てる", () => {
      const reordered = [
        { id: "c", sortOrder: 2 },
        { id: "a", sortOrder: 0 },
        { id: "b", sortOrder: 1 },
      ];
      expect(normalizeSortOrders(reordered)).toEqual([
        { id: "c", sortOrder: 0 },
        { id: "a", sortOrder: 1 },
        { id: "b", sortOrder: 2 },
      ]);
    });

    it("空配列は空配列を返す", () => {
      expect(normalizeSortOrders([])).toEqual([]);
    });

    it("元配列を破壊しない", () => {
      const source = [{ id: "x", sortOrder: 5 }];
      normalizeSortOrders(source);
      expect(source).toEqual([{ id: "x", sortOrder: 5 }]);
    });
  });

  describe("nextSortOrder", () => {
    it("空配列なら 0", () => {
      expect(nextSortOrder([])).toBe(0);
    });

    it("既存の最大 sortOrder + 1 を返す", () => {
      expect(nextSortOrder(items)).toBe(4);
    });

    it("順不同でも最大値 + 1 を返す", () => {
      expect(nextSortOrder([{ sortOrder: 7 }, { sortOrder: 2 }])).toBe(8);
    });

    it("単一要素なら sortOrder + 1", () => {
      expect(nextSortOrder([{ sortOrder: 0 }])).toBe(1);
    });
  });

  describe("reorder", () => {
    it("移動により変化した要素のみの差分を返す", () => {
      // a を index 2 へ → [b,c,a,d]、正規化後 b:0 c:1 a:2 d:3
      // 変化: a(0→2) b(1→0) c(2→1)、d は 3 のまま変わらず差分に含めない。
      const diff = reorder(items, "a", 2);
      const byId = Object.fromEntries(diff.map((d) => [d.id, d.sortOrder]));
      expect(byId).toEqual({ a: 2, b: 0, c: 1 });
      expect(diff.some((d) => d.id === "d")).toBe(false);
    });

    it("同じ位置への移動は空の差分", () => {
      expect(reorder(items, "b", 1)).toEqual([]);
    });

    it("存在しない id は空の差分", () => {
      expect(reorder(items, "zzz", 0)).toEqual([]);
    });

    it("元配列を破壊しない", () => {
      const source = [...items];
      reorder(source, "d", 0);
      expect(source.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    });
  });
});
