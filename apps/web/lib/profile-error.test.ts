import { describe, expect, it } from "vitest";
import { classifyProfileError } from "./profile-error";

// B5 設定（§6.8 / §5.2）。updateProfile の失敗メッセージを画面の状態に振り分ける純ロジック。
// slug 重複 → role="alert"（form 全体）、slug 形式不正 → フィールドエラー（aria-invalid）、
// その他 → form 全体の alert。next 非依存なのでユニットテスト対象。

describe("classifyProfileError", () => {
  it("slug 重複は slug フィールドの重複エラー文に振り分ける", () => {
    expect(classifyProfileError("slug is already taken")).toEqual({
      slug: "この slug は使用されています",
    });
  });

  it("slug 形式不正は slug フィールドの形式エラー文に振り分ける", () => {
    expect(classifyProfileError("slug is invalid")).toEqual({
      slug: "slug の形式が正しくありません",
    });
  });

  it("displayName 空のローカル検証エラーは表示名フィールドへ", () => {
    expect(classifyProfileError("displayName must not be empty")).toEqual({
      displayName: "表示名を入力してください",
    });
  });

  it("slug 空のローカル検証エラーは slug フィールドへ", () => {
    expect(classifyProfileError("slug must not be empty")).toEqual({
      slug: "slug を入力してください",
    });
  });

  it("分類できないエラーは form 全体のエラーに倒す", () => {
    expect(classifyProfileError("Request failed (500)")).toEqual({
      form: "Request failed (500)",
    });
  });
});
