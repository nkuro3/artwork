"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { createArtworkAction, updateArtworkAction } from "./actions";
import {
  ImageUploader,
  type ImageUploaderHandle,
  type InitialImage,
} from "./image-uploader";

// B4 作品作成/編集フォーム（FR-06 / FR-08 / FR-09 / §6.6 / §6.7）。
// - メタ（title/description/status/isPublic）は Server Action 経由で api に保存（ADR D6/D7）。
// - 画像は ImageUploader が担当：選択時にブラウザから署名 URL → R2 直 PUT → メタ作成（lib/upload は不変）。
//   サムネ・削除・並び替え（↑/↓）をその場で扱い、削除/並び替えは既存 API（C3）に結線する。
// 画像アップロードには artwork id が要るため、新規作成時は初回アップロードで作品を遅延作成する
// （ensureArtworkId）。送信時はメタを最新化し、最後に並び順を確定（commitOrder）する。
// 純ロジック（title 検証 / 並び替え index）は lib 側でテスト。レンダリングは /verify。

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
  /** 既存画像（編集時のプリフィル / B4b・§6.7）。 */
  initialImages?: InitialImage[];
}

const containerStyle: CSSProperties = {
  maxWidth: "var(--container-form)",
};

const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-6)",
};

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

const checkboxFieldStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
};

const errorTextStyle: CSSProperties = {
  margin: `var(--space-1) 0 0`,
  fontSize: "var(--text-sm)",
  color: "var(--color-error)",
};

const actionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-4)",
  marginTop: "var(--space-2)",
};

export function ArtworkForm({
  artworkId,
  defaults,
  initialImages,
}: ArtworkFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  // 新規作成時に確定した artwork id（初回アップロードで作る → 送信時は update）。
  const createdIdRef = useRef<string | undefined>(undefined);
  const uploaderRef = useRef<ImageUploaderHandle | null>(null);

  /** 現在のフォーム値から FormData を作る（送信用と遅延作成用で共用）。 */
  const currentFormData = useCallback((): FormData | null => {
    const el = formRef.current;
    return el ? new FormData(el) : null;
  }, []);

  /**
   * アップロード先の artwork id を確定する。
   * - 編集: 既存 id をそのまま返す。
   * - 新規: まだ作っていなければ現在のフォーム値で作成し、id を採番して返す。
   * title 空なら作成せずエラーにし、フィールドエラーも出す。
   */
  const ensureArtworkId = useCallback(async (): Promise<
    { ok: true; id: string } | { ok: false; error: string }
  > => {
    if (artworkId) return { ok: true, id: artworkId };
    if (createdIdRef.current) return { ok: true, id: createdIdRef.current };

    const form = currentFormData();
    if (!form) return { ok: false, error: "フォームを初期化できませんでした" };
    if (String(form.get("title") ?? "").trim() === "") {
      setTitleError("タイトルを入力してください");
      return { ok: false, error: "タイトルを入力してください" };
    }

    const created = await createArtworkAction(form);
    if (!created.ok) return { ok: false, error: created.error };
    createdIdRef.current = created.data.id;
    return { ok: true, id: created.data.id };
  }, [artworkId, currentFormData]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setTitleError(null);

    const form = new FormData(e.currentTarget);
    if (String(form.get("title") ?? "").trim() === "") {
      setTitleError("タイトルを入力してください");
      return;
    }

    setPending(true);

    // 1) メタを保存。新規で画像未アップロード=未作成なら作成、作成済み/編集なら更新。
    const existingId = artworkId ?? createdIdRef.current;
    if (existingId) {
      const updated = await updateArtworkAction(existingId, form);
      if (!updated.ok) return finishWithError(updated.error);
    } else {
      const created = await createArtworkAction(form);
      if (!created.ok) return finishWithError(created.error);
      createdIdRef.current = created.data.id;
    }

    // 2) 並び順を確定（画像が複数で順序変更があった場合のみ PATCH / C3）。
    if (uploaderRef.current) {
      const ordered = await uploaderRef.current.commitOrder();
      if (!ordered.ok) return finishWithError(ordered.error);
    }

    setPending(false);
    router.push("/artworks");
    router.refresh();
  }

  function finishWithError(message: string) {
    setError(message);
    setPending(false);
  }

  const titleErrorId = titleError ? "title-error" : undefined;

  return (
    <div style={containerStyle}>
      <form ref={formRef} onSubmit={onSubmit} noValidate style={formStyle}>
        {error ? (
          <p role="alert" style={errorTextStyle}>
            {error}
          </p>
        ) : null}

        <div style={fieldStyle}>
          <label htmlFor="title">タイトル（必須）</label>
          <input
            id="title"
            type="text"
            name="title"
            defaultValue={defaults?.title ?? ""}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleErrorId}
            onChange={() => titleError && setTitleError(null)}
          />
          {titleError ? (
            <p id={titleErrorId} role="alert" style={errorTextStyle}>
              {titleError}
            </p>
          ) : null}
        </div>

        <div style={fieldStyle}>
          <label htmlFor="description">説明</label>
          <textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={defaults?.description ?? ""}
          />
        </div>

        <div style={fieldStyle}>
          <label htmlFor="status">状態</label>
          <select
            id="status"
            name="status"
            defaultValue={defaults?.status ?? "draft"}
          >
            <option value="draft">下書き</option>
            <option value="published">公開</option>
          </select>
        </div>

        <div style={checkboxFieldStyle}>
          <input
            id="isPublic"
            type="checkbox"
            name="isPublic"
            defaultChecked={defaults?.isPublic ?? false}
          />
          <label htmlFor="isPublic">ポートフォリオに掲載する</label>
        </div>

        <ImageUploader
          {...(artworkId ? { artworkId } : {})}
          {...(initialImages ? { initialImages } : {})}
          {...(defaults?.title ? { title: defaults.title } : {})}
          ensureArtworkId={ensureArtworkId}
          onReady={(h) => {
            uploaderRef.current = h;
          }}
        />

        <div style={actionsStyle}>
          <button type="submit" disabled={pending}>
            {artworkId ? "保存" : "作成"}
          </button>
          <a href="/artworks">一覧へ戻る</a>
        </div>
      </form>
    </div>
  );
}
