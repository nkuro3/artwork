import { describe, expect, it } from "vitest";
import { headerNavLinks } from "./nav";

// A2 共通ナビ（仕様 02 §5.1）。認証状態でヘッダー右リンクを出し分ける純ロジック。
// JSX レンダリングはせず、リンクの集合（label/href）だけを検証する。

describe("headerNavLinks", () => {
  it("未ログインは ログイン / 登録 を返す", () => {
    expect(headerNavLinks(false)).toEqual([
      { label: "ログイン", href: "/login" },
      { label: "登録", href: "/signup" },
    ]);
  });

  it("ログイン済みは 作品管理 / 設定 / ログアウト を返す", () => {
    expect(headerNavLinks(true)).toEqual([
      { label: "作品管理", href: "/artworks" },
      { label: "設定", href: "/settings" },
      { label: "ログアウト", href: "/logout" },
    ]);
  });
});
