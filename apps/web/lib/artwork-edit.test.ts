import { describe, expect, it } from "vitest";
import {
  autosavePatch,
  draftCreateInput,
  validatePublishTitle,
} from "./artwork-edit";

// 02 §6.6/6.7 下書きフロー純ロジック（ADR D12 / status モデル）。
// - draftCreateInput: 新規下書きの作成入力（title 空・status=draft）。
// - autosavePatch: 編集画面で 1 フィールド変更時に送る部分更新パッチ。
// - validatePublishTitle: 「公開（status=published）」へ変更する時の実効タイトル必須判定。
// next / DOM 非依存。結線（onBlur/onChange）はプレゼン層で型/ビルド担保。

describe("draftCreateInput", () => {
  it("title 空・status=draft の作成入力を返す", () => {
    expect(draftCreateInput()).toEqual({ title: "", status: "draft" });
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

  it("status は draft / published / archived のみ載せる", () => {
    expect(autosavePatch("status", "published")).toEqual({
      status: "published",
    });
    expect(autosavePatch("status", "draft")).toEqual({ status: "draft" });
    expect(autosavePatch("status", "archived")).toEqual({
      status: "archived",
    });
  });

  it("status が不正値なら空パッチ（送らない）", () => {
    expect(autosavePatch("status", "bogus")).toEqual({});
  });
});

describe("validatePublishTitle", () => {
  it("非空（トリム後）なら null（エラーなし）", () => {
    expect(validatePublishTitle("夜")).toBeNull();
    expect(validatePublishTitle("  夜  ")).toBeNull();
  });

  it("空 / 空白のみは日本語の必須メッセージを返す", () => {
    expect(validatePublishTitle("")).toBe("タイトルを入力してください");
    expect(validatePublishTitle("   ")).toBe("タイトルを入力してください");
  });
});
