// 02 §6.6/6.7 下書きフローの純ロジック（next / DOM 非依存・ユニットテスト対象）。
// プレゼン層（artwork-form の onBlur/onChange 結線・ボタン出し分け・バッジ）は
// この関数群を呼ぶだけにし、型/ビルドで担保する。

import type { CreateArtworkInput, UpdateArtworkPatch } from "./artworks";

/**
 * 新規下書きの作成入力（§6.6）。タイトル空・isDraft=true。
 * api は title 空を受理し（登録は PATCH で確定）、isDraft 既定 true だが明示する。
 */
export function draftCreateInput(): CreateArtworkInput {
  return { title: "", isDraft: true };
}

/** 自動保存できるフィールド（§6.7：タイトル/説明=blur・状態/公開可否=change）。 */
export type AutosaveField = "title" | "description" | "status" | "isPublic";

/** AutosaveField に対応する値の型。 */
export type AutosaveValue<F extends AutosaveField> = F extends "isPublic"
  ? boolean
  : string;

/**
 * 1 フィールド変更時に送る部分更新パッチを組む（§6.7 自動保存）。
 * - title: 生値のまま（下書きは空も許容。登録時のみ別途必須チェック）。
 * - description: 空白のみは null（未設定）に正規化。
 * - status: draft/published 以外は載せない（空パッチ）。
 * - isPublic: boolean に正規化。
 */
export function autosavePatch<F extends AutosaveField>(
  field: F,
  value: AutosaveValue<F>,
): UpdateArtworkPatch {
  switch (field) {
    case "title":
      return { title: value as string };
    case "description": {
      const v = value as string;
      return { description: v.trim() === "" ? null : v };
    }
    case "status": {
      const v = value as string;
      return v === "draft" || v === "published" ? { status: v } : {};
    }
    case "isPublic":
      return { isPublic: Boolean(value) };
    default:
      return {};
  }
}

/**
 * 「登録（isDraft=false 化）」時の実効タイトル必須判定（§6.7）。
 * 妥当なら null、空ならエラーメッセージ（api と同一文言）。
 */
export function validateRegisterTitle(title: string): string | null {
  return title.trim() === "" ? "タイトルを入力してください" : null;
}
