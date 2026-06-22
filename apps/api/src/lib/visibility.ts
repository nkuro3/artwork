/**
 * B4 公開可視判定（FR-12 公開ポートフォリオに出す作品の絞り込み / FR-13 並び順）。
 *
 * 純ロジックのみ。DB アクセスはしない。
 * 入力は取得済みの作品行（の最小プロパティ）で、出力も配列。
 */

import { artworkStatus } from "@artwork/database/schema";

/**
 * 作品のステータス。`@artwork/database` の `artwork_status` enum と単一ソースで一致させる
 * （drift 防止のためリテラルを再定義せず enum から導出する）。
 *
 * 注: `status` は公開条件に**関与しない**（フォーム用に温存）。公開判定は `isDraft` を使う。
 */
export type ArtworkStatus = (typeof artworkStatus.enumValues)[number];

/** 公開可視判定に必要な最小プロパティ。 */
export interface ArtworkVisibility {
  isPublic: boolean;
  isDraft: boolean;
}

/**
 * 公開ポートフォリオに表示してよい作品かを判定する（FR-12 / 02 仕様「下書きモデル」）。
 * `is_public === true` かつ `is_draft === false` の場合のみ true。
 * `status` は公開条件に関与しない。
 */
export function isArtworkPublic(artwork: ArtworkVisibility): boolean {
  return artwork.isPublic && artwork.isDraft === false;
}

/**
 * 公開条件を満たす作品だけを残し、`sortOrder` 昇順に並べた新配列を返す（FR-12 + FR-13）。
 *
 * - 元配列は破壊しない。
 * - 同一 `sortOrder` の相対順は入力順を保つ（安定ソート）。
 */
export function filterPublicArtworks<
  T extends ArtworkVisibility & { sortOrder: number },
>(artworks: readonly T[]): T[] {
  return artworks
    .filter(isArtworkPublic)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
