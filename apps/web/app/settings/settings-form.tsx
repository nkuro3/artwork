"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { updateProfileAction } from "./actions";

// D4 設定フォーム（FR-03 プロフィール / slug / 公開設定）。薄いクライアントコンポーネント。
// 入力は Server Action 経由で api に保存（ADR D6/D7）。純ロジックは lib/profile.test.ts で
// カバー。レンダリングは /verify で確認する。

export interface SettingsFormDefaults {
  displayName: string;
  slug: string;
  bio: string;
  isPublic: boolean;
}

export function SettingsForm({ defaults }: { defaults: SettingsFormDefaults }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);

    const form = new FormData(e.currentTarget);
    const result = await updateProfileAction(form);

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error ? <p role="alert">{error}</p> : null}
      {saved ? <p role="status">保存しました</p> : null}
      <label>
        表示名
        <input type="text" name="displayName" defaultValue={defaults.displayName} />
      </label>
      <label>
        公開 URL slug
        <input type="text" name="slug" defaultValue={defaults.slug} />
      </label>
      <label>
        自己紹介
        <textarea name="bio" defaultValue={defaults.bio} />
      </label>
      <label>
        <input
          type="checkbox"
          name="isPublic"
          defaultChecked={defaults.isPublic}
        />
        ポートフォリオを公開する
      </label>
      <button type="submit" disabled={pending}>
        保存
      </button>
    </form>
  );
}
