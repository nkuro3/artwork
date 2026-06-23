// B5 設定（§6.8 / §5.2）。updateProfile（lib/profile）の失敗メッセージを
// 設定画面の状態へ振り分ける純ロジック。api / lib の英語メッセージを画面の
// フィールドエラー or form 全体エラーに分類し、日本語文言に整える。
// next 非依存・純ロジックなのでユニットテスト対象（画面は薄いラッパで非対象）。

/** 設定フォームのエラー表示先。フィールド別 or form 全体。 */
export interface ProfileFormErrors {
  displayName?: string;
  slug?: string;
  /** どのフィールドにも紐づかない全体エラー（role="alert" で操作近傍に出す）。 */
  form?: string;
}

/**
 * updateProfile の失敗メッセージを画面の状態に振り分ける（§5.2）。
 * - slug 重複（"slug is already taken"）→ slug フィールドのエラー文言
 * - slug 形式不正（"slug is invalid"）→ slug フィールドの形式エラー
 * - ローカル検証（空文字）→ 該当フィールド
 * - それ以外 → form 全体エラー（メッセージはそのまま）
 */
export function classifyProfileError(error: string): ProfileFormErrors {
  if (error === "slug is already taken") {
    return { slug: "この slug は使用されています" };
  }
  if (error === "slug is invalid") {
    return { slug: "slug の形式が正しくありません" };
  }
  if (error === "slug must not be empty") {
    return { slug: "slug を入力してください" };
  }
  if (error === "displayName must not be empty") {
    return { displayName: "表示名を入力してください" };
  }
  return { form: error };
}
