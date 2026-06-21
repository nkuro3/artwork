"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authFormsClient } from "../../lib/auth-client";
import { submitSignup, type FormErrors } from "../../lib/auth-forms";

// D2 サインアップ画面（FR-01）。薄いクライアントコンポーネント。
// レンダリングテストは行わず /verify で確認する。

export default function SignupPage() {
  const router = useRouter();
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    const data = new FormData(e.currentTarget);
    const displayName = String(data.get("displayName") ?? "").trim();
    const result = await submitSignup(authFormsClient, {
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
      ...(displayName ? { displayName } : {}),
    });
    if (result.ok) {
      router.push("/artworks");
      return;
    }
    setErrors(result.errors);
    setPending(false);
  }

  return (
    <main>
      <h1>アカウント作成</h1>
      <form onSubmit={onSubmit} noValidate>
        {errors.form ? <p role="alert">{errors.form}</p> : null}
        <label>
          表示名（任意）
          <input type="text" name="displayName" autoComplete="name" />
        </label>
        {errors.displayName ? <p role="alert">{errors.displayName}</p> : null}
        <label>
          メールアドレス
          <input type="email" name="email" autoComplete="email" />
        </label>
        {errors.email ? <p role="alert">{errors.email}</p> : null}
        <label>
          パスワード（8 文字以上）
          <input
            type="password"
            name="password"
            autoComplete="new-password"
          />
        </label>
        {errors.password ? <p role="alert">{errors.password}</p> : null}
        <button type="submit" disabled={pending}>
          登録
        </button>
      </form>
      <a href="/login">ログインへ</a>
    </main>
  );
}
