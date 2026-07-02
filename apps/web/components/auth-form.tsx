"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { authClient } from "../lib/auth-client";

type Mode = "signup" | "signin";

// ワイヤーフレーム品質の共通認証フォーム。装飾なし・余白と整列のみ整える。
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    const result =
      mode === "signup"
        ? await authClient.signUp.email({
            email,
            password,
            name: String(form.get("name") ?? ""),
          })
        : await authClient.signIn.email({ email, password });

    setSubmitting(false);
    if (result.error) {
      setError(result.error.message ?? "認証に失敗しました");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 320 }}
    >
      {mode === "signup" && (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          名前
          <input name="name" type="text" required autoComplete="name" />
        </label>
      )}
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        メールアドレス
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        パスワード
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {mode === "signup" ? "サインアップ" : "サインイン"}
      </button>
    </form>
  );
}
