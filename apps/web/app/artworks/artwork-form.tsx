"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createBrowserApiClient } from "../../lib/api";
import { uploadArtworkImage } from "../../lib/upload";
import { createArtworkAction, updateArtworkAction } from "./actions";

// D3 作品作成/編集フォーム（FR-05 / FR-06）。薄いクライアントコンポーネント。
// - メタ（title/description/status/isPublic）は Server Action 経由で api に保存（ADR D6/D7）。
// - 画像は作成済み artwork に対し、ブラウザから署名 URL → R2 直 PUT → メタ作成（NFR-02）。
//   新規作成時は「先に作品を作成 → その id に画像を紐づけ」の順で行う。
// 純ロジックは lib/artworks.test.ts / lib/upload.test.ts でカバー。レンダリングは /verify。

export interface ArtworkFormDefaults {
  title?: string;
  description?: string;
  status?: "draft" | "published";
  isPublic?: boolean;
}

export interface ArtworkFormProps {
  /** 編集対象の id。未指定なら新規作成。 */
  artworkId?: string;
  defaults?: ArtworkFormDefaults;
}

export function ArtworkForm({ artworkId, defaults }: ArtworkFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const files = form.getAll("images").filter(isFile);

    // 1) メタを保存（新規 = 作成、編集 = 更新）。id を確定させてから画像を紐づける。
    let targetId = artworkId;
    if (targetId) {
      const updated = await updateArtworkAction(targetId, form);
      if (!updated.ok) return finishWithError(updated.error);
    } else {
      const created = await createArtworkAction(form);
      if (!created.ok) return finishWithError(created.error);
      targetId = created.data.id;
    }

    // 2) 画像をブラウザから署名 URL → R2 直 PUT → メタ作成（複数可 / FR-06）。
    if (files.length > 0) {
      const client = createBrowserApiClient();
      for (const file of files) {
        const result = await uploadArtworkImage(
          { client },
          { artworkId: targetId, file },
        );
        if (!result.ok) return finishWithError(result.error);
      }
    }

    setPending(false);
    router.push("/artworks");
    router.refresh();
  }

  function finishWithError(message: string) {
    setError(message);
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error ? <p role="alert">{error}</p> : null}
      <label>
        タイトル
        <input type="text" name="title" defaultValue={defaults?.title ?? ""} />
      </label>
      <label>
        説明
        <textarea name="description" defaultValue={defaults?.description ?? ""} />
      </label>
      <label>
        状態
        <select name="status" defaultValue={defaults?.status ?? "draft"}>
          <option value="draft">下書き</option>
          <option value="published">公開</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          name="isPublic"
          defaultChecked={defaults?.isPublic ?? false}
        />
        ポートフォリオに掲載する
      </label>
      <label>
        画像（複数選択可）
        <input type="file" name="images" accept="image/*" multiple />
      </label>
      <button type="submit" disabled={pending}>
        {artworkId ? "更新" : "作成"}
      </button>
    </form>
  );
}

function isFile(v: FormDataEntryValue): v is File {
  return v instanceof File && v.size > 0;
}
