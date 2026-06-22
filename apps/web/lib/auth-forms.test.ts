import { describe, expect, it, vi } from "vitest";
import {
  submitLogin,
  submitSignup,
  validateLogin,
  validateSignup,
  type AuthFormsClient,
} from "./auth-forms";

// D2 認証フォームの純ロジック（FR-01 / ADR D6）。
// client は注入し、検証は client 呼び出し前に early return することを検証する。
// 重いテスト基盤（jsdom/testing-library）は使わず、ロジックのみを対象にする。

describe("validateLogin", () => {
  it("妥当な入力ならエラー無し（空オブジェクト）", () => {
    expect(
      validateLogin({ email: "a@example.com", password: "password1" }),
    ).toEqual({});
  });

  it("空メールは email エラー", () => {
    const errors = validateLogin({ email: "", password: "password1" });
    expect(errors.email).toBeTruthy();
    expect(errors.password).toBeUndefined();
  });

  it("メール形式不正は email エラー", () => {
    expect(
      validateLogin({ email: "not-an-email", password: "password1" }).email,
    ).toBeTruthy();
    expect(
      validateLogin({ email: "a@b", password: "password1" }).email,
    ).toBeTruthy();
    expect(
      validateLogin({ email: "a @b.com", password: "password1" }).email,
    ).toBeTruthy();
  });

  it("空パスワードは password エラー", () => {
    const errors = validateLogin({ email: "a@example.com", password: "" });
    expect(errors.password).toBeTruthy();
  });

  it("ログインは短すぎパスワードでも形式上は受理（存在のみ確認）", () => {
    // ログインは長さ要件を課さない（登録時のみ）。空でなければ通す。
    expect(
      validateLogin({ email: "a@example.com", password: "x" }).password,
    ).toBeUndefined();
  });

  it("前後空白はトリムして判定", () => {
    expect(
      validateLogin({ email: "  a@example.com  ", password: "password1" }),
    ).toEqual({});
  });
});

describe("validateSignup", () => {
  it("妥当な入力（displayName 省略可）ならエラー無し", () => {
    expect(
      validateSignup({ email: "a@example.com", password: "password1" }),
    ).toEqual({});
    expect(
      validateSignup({
        email: "a@example.com",
        password: "password1",
        displayName: "Alice",
      }),
    ).toEqual({});
  });

  it("メール形式不正は email エラー", () => {
    expect(
      validateSignup({ email: "bad", password: "password1" }).email,
    ).toBeTruthy();
  });

  it("8 文字未満のパスワードは password エラー", () => {
    expect(
      validateSignup({ email: "a@example.com", password: "short" }).password,
    ).toBeTruthy();
    expect(
      validateSignup({ email: "a@example.com", password: "1234567" }).password,
    ).toBeTruthy();
  });

  it("ちょうど 8 文字は受理", () => {
    expect(
      validateSignup({ email: "a@example.com", password: "12345678" }).password,
    ).toBeUndefined();
  });

  it("空白のみの displayName は無効", () => {
    expect(
      validateSignup({
        email: "a@example.com",
        password: "password1",
        displayName: "   ",
      }).displayName,
    ).toBeTruthy();
  });

  it("複数の不正を同時に返す", () => {
    const errors = validateSignup({ email: "bad", password: "x" });
    expect(errors.email).toBeTruthy();
    expect(errors.password).toBeTruthy();
  });
});

function okClient(): AuthFormsClient {
  return {
    signIn: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    signUp: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    signOut: vi.fn().mockResolvedValue({ data: null }),
  };
}

describe("submitLogin", () => {
  it("検証エラー時は client を呼ばず errors を返す", async () => {
    const client = okClient();
    const result = await submitLogin(client, {
      email: "bad",
      password: "password1",
    });

    expect(result.ok).toBe(false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.email).toBeTruthy();
    }
    expect(client.signIn).not.toHaveBeenCalled();
  });

  it("妥当時は signIn を呼び、成功なら ok:true", async () => {
    const client = okClient();
    const result = await submitLogin(client, {
      email: "a@example.com",
      password: "password1",
    });

    expect(client.signIn).toHaveBeenCalledWith({
      email: "a@example.com",
      password: "password1",
    });
    expect(result.ok).toBe(true);
  });

  it("client がエラーオブジェクトを返したら ok:false + formError", async () => {
    const client = okClient();
    client.signIn = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Invalid credentials" },
    });

    const result = await submitLogin(client, {
      email: "a@example.com",
      password: "password1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.form).toBe("Invalid credentials");
    }
  });

  it("client が throw しても ok:false に正規化する", async () => {
    const client = okClient();
    client.signIn = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await submitLogin(client, {
      email: "a@example.com",
      password: "password1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.form).toBeTruthy();
    }
  });

  it("error にメッセージが無くても汎用 form エラーにする", async () => {
    const client = okClient();
    client.signIn = vi.fn().mockResolvedValue({ data: null, error: {} });

    const result = await submitLogin(client, {
      email: "a@example.com",
      password: "password1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.form).toBeTruthy();
  });
});

describe("submitSignup", () => {
  it("検証エラー時は client を呼ばない", async () => {
    const client = okClient();
    const result = await submitSignup(client, {
      email: "a@example.com",
      password: "short",
    });

    expect(result.ok).toBe(false);
    expect(client.signUp).not.toHaveBeenCalled();
  });

  it("妥当時は signUp を呼び、displayName を name として渡す", async () => {
    const client = okClient();
    const result = await submitSignup(client, {
      email: "a@example.com",
      password: "password1",
      displayName: "Alice",
    });

    expect(client.signUp).toHaveBeenCalledWith({
      email: "a@example.com",
      password: "password1",
      name: "Alice",
    });
    expect(result.ok).toBe(true);
  });

  it("displayName 省略時は name にメールのローカル部を補完", async () => {
    const client = okClient();
    await submitSignup(client, {
      email: "alice@example.com",
      password: "password1",
    });

    expect(client.signUp).toHaveBeenCalledWith({
      email: "alice@example.com",
      password: "password1",
      name: "alice",
    });
  });

  it("client エラー時は ok:false + formError", async () => {
    const client = okClient();
    client.signUp = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Email already used" },
    });

    const result = await submitSignup(client, {
      email: "a@example.com",
      password: "password1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.form).toBe("Email already used");
    }
  });

  it("入力は trim して送る", async () => {
    const client = okClient();
    await submitSignup(client, {
      email: "  a@example.com ",
      password: "password1",
      displayName: "  Alice  ",
    });

    expect(client.signUp).toHaveBeenCalledWith({
      email: "a@example.com",
      password: "password1",
      name: "Alice",
    });
  });
});
