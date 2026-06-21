/**
 * B3 sort_order ロジック（FR-09 作品の表示順 / FR-13 ポートフォリオの並び順）。
 * 作品画像の並び替え（FR-06）にも使う汎用の並び替えロジック。
 *
 * 純ロジックのみ。DB アクセスはしない。
 * 入出力は配列で、永続化（sort_order 列の更新）は呼び出し側の責務。
 */

/** id を持つ要素。並び替えの対象を識別するための最小制約。 */
interface Identified {
  id: string;
}

/** sortOrder を持つ要素。次の連番算出（{@link nextSortOrder}）の入力。 */
interface Ordered {
  sortOrder: number;
}

/** 永続化すべき並び順の更新単位（id とその新しい sortOrder）。 */
export interface SortOrderUpdate {
  id: string;
  sortOrder: number;
}

/**
 * 0..max の範囲に値をクランプする。max が負（空配列由来）なら 0 を返す。
 */
function clampIndex(index: number, max: number): number {
  if (max < 0) return 0;
  if (index < 0) return 0;
  if (index > max) return max;
  return index;
}

/**
 * `id` の要素を `toIndex` の位置へ移動した新しい配列を返す（元配列は不変）。
 *
 * - `toIndex` は 0..length-1 にクランプする。
 * - 該当 id が無ければ元と同等の新配列をそのまま返す。
 */
export function moveItem<T extends Identified>(
  items: readonly T[],
  id: string,
  toIndex: number,
): T[] {
  const next = [...items];
  const fromIndex = next.findIndex((item) => item.id === id);
  if (fromIndex === -1) return next;

  const target = clampIndex(toIndex, next.length - 1);
  if (target === fromIndex) return next;

  // 取り出してから挿入する。splice は取り出し後に長さが縮むが、
  // target は元の長さ基準のクランプ済みインデックスで安全に挿入できる。
  const [moved] = next.splice(fromIndex, 1);
  // moved は fromIndex 在中を確認済みのため必ず存在する（noUncheckedIndexedAccess 対策）。
  next.splice(target, 0, moved as T);
  return next;
}

/**
 * 並び順（配列の並び）に従って sortOrder を 0,1,2,... の連番で割り当てた
 * 更新リストを返す。元配列は破壊しない。
 */
export function normalizeSortOrders<T extends Identified>(
  orderedItems: readonly T[],
): SortOrderUpdate[] {
  return orderedItems.map((item, index) => ({
    id: item.id,
    sortOrder: index,
  }));
}

/**
 * 新規追加用に割り当てるべき sortOrder を返す。
 * 現在の最大 sortOrder + 1（空なら 0）。
 */
export function nextSortOrder(items: readonly Ordered[]): number {
  if (items.length === 0) return 0;
  let max = items[0]!.sortOrder;
  for (const item of items) {
    if (item.sortOrder > max) max = item.sortOrder;
  }
  return max + 1;
}

/**
 * `moveItem` → `normalizeSortOrders` を合成し、永続化すべき差分のみを返す。
 *
 * 入力 `items` は現在の並び（= 現在の sortOrder 順）であることを前提とし、
 * その既存 sortOrder（暗黙には添字 0..n-1）と移動後の sortOrder を比較して、
 * 変化した要素だけを返す（C3 の最小更新クエリ用）。
 */
export function reorder<T extends Identified>(
  items: readonly T[],
  id: string,
  toIndex: number,
): SortOrderUpdate[] {
  const moved = moveItem(items, id, toIndex);
  const normalized = normalizeSortOrders(moved);

  // 入力時点の並び順位置（添字）を現在の sortOrder とみなして比較する。
  const currentOrderById = new Map<string, number>();
  items.forEach((item, index) => currentOrderById.set(item.id, index));

  return normalized.filter(
    (update) => currentOrderById.get(update.id) !== update.sortOrder,
  );
}
