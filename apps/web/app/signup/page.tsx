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
import { submitSignup, type FormErrors } from "../../lib/auth-forms";

// B2 サインアップ画面（仕様 02 §6.3 / FR-01）。薄いクライアントコンポーネント。
// レンダリングテストは行わず /verify で確認する。UI のみ整備しロジックは変更しない。

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
    <AuthShell>
      <h1>登録</h1>
      <AuthFormBody onSubmit={onSubmit}>
        {errors.form ? <p role="alert">{errors.form}</p> : null}
        <AuthField
          label="表示名"
          name="displayName"
          type="text"
          autoComplete="name"
          error={errors.displayName}
        />
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
          autoComplete="new-password"
          hint="8 文字以上"
          error={errors.password}
        />
        <button type="submit" disabled={pending}>
          登録
        </button>
      </AuthFormBody>
      <AuthLinkRow>
        <Link href="/login">ログインへ</Link>
      </AuthLinkRow>
    </AuthShell>
  );
}
