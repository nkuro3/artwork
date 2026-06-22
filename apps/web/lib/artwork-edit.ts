// 02 §6.6/6.7 下書きフローの純ロジック（next / DOM 非依存・ユニットテスト対象 / ADR D12）。
// プレゼン層（artwork-form の onBlur/onChange 結線・状態 select・バッジ）は
// この関数群を呼ぶだけにし、型/ビルドで担保する。

import type { CreateArtworkInput, UpdateArtworkPatch } from "./artworks";

/**
 * 新規下書きの作成入力（§6.6 / ADR D12）。タイトル空・status=draft。
 * api は title 空を受理し（公開は PATCH で確定）、status 既定 draft だが明示する。
 */
export function draftCreateInput(): CreateArtworkInput {
  return { title: "", status: "draft" };
}

/** 自動保存できるフィールド（§6.7：タイトル/説明=blur・状態=change）。 */
export type AutosaveField = "title" | "description" | "status";

/** AutosaveField に対応する値の型（いずれも文字列）。 */
export type AutosaveValue<_F extends AutosaveField> = string;

/**
 * 1 フィールド変更時に送る部分更新パッチを組む（§6.7 自動保存）。
 * - title: 生値のまま（下書きは空も許容。公開時のみ別途必須チェック）。
 * - description: 空白のみは null（未設定）に正規化。
 * - status: draft/published/archived 以外は載せない（空パッチ）。
 */
export function autosavePatch<F extends AutosaveField>(
  field: F,
  value: AutosaveValue<F>,
): UpdateArtworkPatch {
  switch (field) {
    case "title":
      return { title: value };
    case "description":
      return { description: value.trim() === "" ? null : value };
    case "status":
      return value === "draft" ||
        value === "published" ||
        value === "archived"
        ? { status: value }
        : {};
    default:
      return {};
  }
}

/**
 * 「公開（status=published 化）」時の実効タイトル必須判定（§6.7 / ADR D12）。
 * 妥当なら null、空ならエラーメッセージ（api と同一文言）。
 */
export function validatePublishTitle(title: string): string | null {
  return title.trim() === "" ? "タイトルを入力してください" : null;
}
