"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  classifyProfileError,
  type ProfileFormErrors,
} from "../../lib/profile-error";
import { updateProfileAction } from "./actions";
import { ProfileSlugLink } from "../../components/profile-slug-link";

// B5 設定フォーム（§6.8 / FR-03 プロフィール / Profile Slug）。薄いクライアントコンポーネント。
// 入力は Server Action 経由で api に保存（ADR D6/D7）。フォーム用コンテナ 480px・縦積み・
// トークン余白で整える（§4）。公開制御は作品の status（published）に統一（ADR D12）。
// Profile Slug は UI 上 `@{slug}` 表記でプロフィールへのリンク、保持値に `@` は含めない（§6.8）。
// エラー振り分け（slug 重複=alert / 形式=フィールド）は lib/profile-error.test.ts でカバー。

export interface SettingsFormDefaults {
  displayName: string;
  slug: string;
  bio: string;
}

const containerStyle: CSSProperties = {
  maxWidth: "var(--container-form)",
};

const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
};

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

const inputStyle: CSSProperties = {
  width: "100%",
};

// User Slug 入力。`@` は表示用の固定プレフィックスで、保持値には含めない（§6.8）。
const slugRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
};

const slugPrefixStyle: CSSProperties = {
  color: "var(--color-text-muted)",
  flex: "0 0 auto",
};

const fieldErrorStyle: CSSProperties = {
  margin: "var(--space-1) 0 0",
  fontSize: "var(--text-sm)",
};

const resultStyle: CSSProperties = {
  marginTop: "var(--space-6)",
};

export function SettingsForm({ defaults }: { defaults: SettingsFormDefaults }) {
  const router = useRouter();
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setSavedSlug(null);

    const form = new FormData(e.currentTarget);
    // 保持値に `@` は含めない。貼り付け等で先頭 `@` が入っても落とす（§6.8）。
    const slugValue = String(form.get("slug") ?? "").replace(/^@+/, "");
    form.set("slug", slugValue);
    const result = await updateProfileAction(form);

    setPending(false);
    if (!result.ok) {
      setErrors(classifyProfileError(result.error));
      return;
    }
    setSavedSlug(result.data.slug);
    router.refresh();
  }

  const slugChanged = savedSlug !== null && savedSlug !== defaults.slug;

  return (
    <div style={containerStyle}>
      <form onSubmit={onSubmit} noValidate style={formStyle}>
        {errors.form ? <p role="alert">{errors.form}</p> : null}

        <div style={fieldStyle}>
          <label htmlFor="displayName">表示名</label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            defaultValue={defaults.displayName}
            aria-invalid={errors.displayName ? true : undefined}
            aria-describedby={errors.displayName ? "displayName-error" : undefined}
            style={inputStyle}
          />
          {errors.displayName ? (
            <p id="displayName-error" role="alert" style={fieldErrorStyle}>
              {errors.displayName}
            </p>
          ) : null}
        </div>

        <div style={fieldStyle}>
          <label htmlFor="slug">Profile Slug</label>
          <div style={slugRowStyle}>
            <span style={slugPrefixStyle} aria-hidden="true">
              @
            </span>
            <input
              id="slug"
              name="slug"
              type="text"
              defaultValue={defaults.slug}
              aria-invalid={errors.slug ? true : undefined}
              aria-describedby={errors.slug ? "slug-error" : undefined}
              style={inputStyle}
            />
          </div>
          {errors.slug ? (
            <p id="slug-error" role="alert" style={fieldErrorStyle}>
              {errors.slug}
            </p>
          ) : null}
        </div>

        <div style={fieldStyle}>
          <label htmlFor="bio">自己紹介</label>
          <textarea
            id="bio"
            name="bio"
            defaultValue={defaults.bio}
            style={inputStyle}
          />
        </div>

        <button type="submit" disabled={pending}>
          保存
        </button>
      </form>

      {savedSlug !== null ? (
        <div role="status" style={resultStyle}>
          <p>保存しました。</p>
          {slugChanged ? (
            <p>
              新しい Profile Slug: <ProfileSlugLink slug={savedSlug} />
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
