import { describe, expect, it } from "vitest";
import { shouldRedirectHome } from "./home";

// B1 ホーム `/`（仕様 02 §6.1）。ログイン済みは /artworks へリダイレクト、
// 未ログインはランディング。リダイレクト判定の純ロジックのみ検証する
// （`redirect()` 呼び出しは next 依存のためテスト対象外）。

describe("shouldRedirectHome", () => {
  it("ログイン済み（session あり）は true", () => {
    expect(shouldRedirectHome({ id: "u1", email: "a@example.com" })).toBe(true);
  });

  it("未ログイン（session null）は false", () => {
    expect(shouldRedirectHome(null)).toBe(false);
  });
});
