"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  AuthField,
  AuthFormBody,
  AuthLinkRow,
  AuthShell,
} from "../../components/auth-form";
import { authFormsClient } from "../../lib/auth-client";
import { submitLogin, type FormErrors } from "../../lib/auth-forms";

// B2 ログイン画面（仕様 02 §6.2 / FR-01）。薄いクライアントコンポーネント。
// レンダリングテストは行わず /verify で確認する（純ロジックは lib/auth-forms.test.ts でカバー済み）。
// UI のみ整備（フォーム用コンテナ 480px・縦積み・状態/文言・a11y）。ロジックは変更しない。

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
    <AuthShell>
      <h1>ログイン</h1>
      <AuthFormBody onSubmit={onSubmit}>
        {errors.form ? <p role="alert">{errors.form}</p> : null}
        <AuthField
          label="メールアドレス"
          name="email"
          type="email"
          autoComplete="email"
          error={errors.email}
        />
        <AuthField
          label="パスワード"
          name="password"
          type="password"
          autoComplete="current-password"
          error={errors.password}
        />
        <button type="submit" disabled={pending}>
          ログイン
        </button>
      </AuthFormBody>
      <AuthLinkRow>
        <Link href="/signup">サインアップへ</Link>
      </AuthLinkRow>
    </AuthShell>
  );
}
