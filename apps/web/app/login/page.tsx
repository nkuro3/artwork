"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authFormsClient } from "../../lib/auth-client";
import { submitLogin, type FormErrors } from "../../lib/auth-forms";

// D2 ログイン画面（FR-01）。薄いクライアントコンポーネント。レンダリングテストは行わず
// /verify で確認する（純ロジックは lib/auth-forms.test.ts でカバー済み）。

export default function LoginPage() {
  const router = useRouter();
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    const data = new FormData(e.currentTarget);
    const result = await submitLogin(authFormsClient, {
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
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
      <h1>ログイン</h1>
      <form onSubmit={onSubmit} noValidate>
        {errors.form ? <p role="alert">{errors.form}</p> : null}
        <label>
          メールアドレス
          <input type="email" name="email" autoComplete="email" />
        </label>
        {errors.email ? <p role="alert">{errors.email}</p> : null}
        <label>
          パスワード
          <input
            type="password"
            name="password"
            autoComplete="current-password"
          />
        </label>
        {errors.password ? <p role="alert">{errors.password}</p> : null}
        <button type="submit" disabled={pending}>
          ログイン
        </button>
      </form>
      <a href="/signup">アカウントを作成</a>
    </main>
  );
}
