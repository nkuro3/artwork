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
 * `draft`（下書き・非公開）/ `published`（公開）/ `archived`（取り下げ・非公開）。
 * 公開（検索・公開ページに出る）= `status==='published'`（ADR D12 / 02 仕様「作品の状態モデル」）。
 */
export type ArtworkStatus = (typeof artworkStatus.enumValues)[number];

/** 公開可視判定に必要な最小プロパティ。 */
export interface ArtworkVisibility {
  status: ArtworkStatus;
}

/**
 * 公開ポートフォリオ・検索に表示してよい作品かを判定する（FR-12 / ADR D12）。
 * `status === 'published'` の場合のみ true（draft / archived は非公開）。
 */
export function isArtworkPublic(artwork: ArtworkVisibility): boolean {
  return artwork.status === "published";
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
