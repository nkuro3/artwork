import { describe, expect, it } from "vitest";
import {
  autosavePatch,
  draftCreateInput,
  validateRegisterTitle,
} from "./artwork-edit";

// 02 §6.6/6.7 下書きフロー純ロジック。
// - draftCreateInput: 新規下書きの作成入力（title 空・isDraft=true）。
// - autosavePatch: 編集画面で 1 フィールド変更時に送る部分更新パッチ。
// - validateRegisterTitle: 「登録（isDraft=false 化）」時の実効タイトル必須判定。
// next / DOM 非依存。結線（onBlur/onChange）はプレゼン層で型/ビルド担保。

describe("draftCreateInput", () => {
  it("title 空・isDraft=true の作成入力を返す", () => {
    expect(draftCreateInput()).toEqual({ title: "", isDraft: true });
  });
});

describe("autosavePatch", () => {
  it("title はトリムせず生値をそのまま載せる（空も許容＝下書き）", () => {
    expect(autosavePatch("title", "  夜  ")).toEqual({ title: "  夜  " });
    expect(autosavePatch("title", "")).toEqual({ title: "" });
  });

  it("description は空文字を null（未設定）に正規化する", () => {
    expect(autosavePatch("description", "説明")).toEqual({
      description: "説明",
    });
    expect(autosavePatch("description", "   ")).toEqual({ description: null });
  });

  it("status は draft / published のみ載せる", () => {
    expect(autosavePatch("status", "published")).toEqual({
      status: "published",
    });
    expect(autosavePatch("status", "draft")).toEqual({ status: "draft" });
  });

  it("status が不正値なら空パッチ（送らない）", () => {
    expect(autosavePatch("status", "bogus")).toEqual({});
  });

  it("isPublic は boolean に正規化する", () => {
    expect(autosavePatch("isPublic", true)).toEqual({ isPublic: true });
    expect(autosavePatch("isPublic", false)).toEqual({ isPublic: false });
  });
});

describe("validateRegisterTitle", () => {
  it("非空（トリム後）なら null（エラーなし）", () => {
    expect(validateRegisterTitle("夜")).toBeNull();
    expect(validateRegisterTitle("  夜  ")).toBeNull();
  });

  it("空 / 空白のみは日本語の必須メッセージを返す", () => {
    expect(validateRegisterTitle("")).toBe("タイトルを入力してください");
    expect(validateRegisterTitle("   ")).toBe("タイトルを入力してください");
  });
});
