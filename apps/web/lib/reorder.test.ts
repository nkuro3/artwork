import { describe, expect, it } from "vitest";
import { canMove, moveItem, sameOrder } from "./reorder";

describe("moveItem", () => {
  it("要素を 1 つ上へ動かす", () => {
    expect(moveItem(["a", "b", "c"], 1, "up")).toEqual(["b", "a", "c"]);
  });

  it("要素を 1 つ下へ動かす", () => {
    expect(moveItem(["a", "b", "c"], 1, "down")).toEqual(["a", "c", "b"]);
  });

  it("先頭を up しても変わらない", () => {
    expect(moveItem(["a", "b", "c"], 0, "up")).toEqual(["a", "b", "c"]);
  });

  it("末尾を down しても変わらない", () => {
    expect(moveItem(["a", "b", "c"], 2, "down")).toEqual(["a", "b", "c"]);
  });

  it("範囲外 index は元の並びを返す", () => {
    expect(moveItem(["a", "b"], 5, "up")).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], -1, "down")).toEqual(["a", "b"]);
  });

  it("元配列を破壊しない（非破壊）", () => {
    const src = ["a", "b", "c"];
    moveItem(src, 1, "up");
    expect(src).toEqual(["a", "b", "c"]);
  });
});

describe("canMove", () => {
  it("先頭は up 不可・down 可", () => {
    expect(canMove(3, 0, "up")).toBe(false);
    expect(canMove(3, 0, "down")).toBe(true);
  });

  it("末尾は down 不可・up 可", () => {
    expect(canMove(3, 2, "down")).toBe(false);
    expect(canMove(3, 2, "up")).toBe(true);
  });

  it("中間はどちらも可", () => {
    expect(canMove(3, 1, "up")).toBe(true);
    expect(canMove(3, 1, "down")).toBe(true);
  });

  it("範囲外は不可", () => {
    expect(canMove(3, 5, "up")).toBe(false);
    expect(canMove(3, -1, "down")).toBe(false);
  });
});

describe("sameOrder", () => {
  it("同じ並びは true", () => {
    expect(sameOrder(["a", "b"], ["a", "b"])).toBe(true);
  });

  it("並びが違えば false", () => {
    expect(sameOrder(["a", "b"], ["b", "a"])).toBe(false);
  });

  it("長さが違えば false", () => {
    expect(sameOrder(["a"], ["a", "b"])).toBe(false);
  });
});
