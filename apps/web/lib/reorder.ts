// B4 並び替えの純ロジック（FR-06 sort_order / §6.6 画像の並び替え UI）。
// 画像リスト（ID 配列）に対する「↑/↓」操作を index 計算として切り出す。
// next / DOM に依存しないのでユニットテスト対象。並び順の確定（PATCH order）は
// 呼び出し側が確定後の ID 配列を api に渡す（C3 /artworks/:id/images/order）。

/** 1 つ上 / 下に動かす方向。 */
export type MoveDirection = "up" | "down";

/**
 * `arr` の `index` 番目を `direction` に 1 つ動かした新しい配列を返す（非破壊）。
 * 端（先頭を up / 末尾を down）や範囲外 index では元の配列の浅いコピーをそのまま返す。
 */
export function moveItem<T>(
  arr: readonly T[],
  index: number,
  direction: MoveDirection,
): T[] {
  const next = [...arr];
  if (index < 0 || index >= next.length) return next;

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= next.length) return next;

  const a = next[index] as T;
  const b = next[target] as T;
  next[index] = b;
  next[target] = a;
  return next;
}

/** その index が指定方向へ動かせるか（端でないか）。ボタンの disabled 判定に使う。 */
export function canMove(
  length: number,
  index: number,
  direction: MoveDirection,
): boolean {
  if (index < 0 || index >= length) return false;
  return direction === "up" ? index > 0 : index < length - 1;
}

/**
 * 2 つの ID 配列が同じ並びかを判定する（順序の変化があったかの判定に使う）。
 * 長さが違う・どこかの要素が違えば false。
 */
export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}
