"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { updateArtworkAction } from "./actions";
import {
  autosavePatch,
  validateRegisterTitle,
  type AutosaveField,
  type AutosaveValue,
} from "../../lib/artwork-edit";
import {
  ImageUploader,
  type ImageUploaderHandle,
  type InitialImage,
} from "./image-uploader";

// B4 作品編集フォーム（§6.7）。下書きフローに集約：artworkId は常に存在する前提。
// - 自動保存: タイトル/説明は blur 時、状態(select)/公開可否(checkbox)は change 時に、
//   変更フィールドのみ PATCH（updateArtworkAction）で随時保存する。保存中/失敗は控えめに表示。
// - プライマリボタン: 下書き(isDraft=true)=「登録」（実効タイトル必須→ PATCH isDraft:false）、
//   登録済み(isDraft=false)=「保存」（最新反映）。両者とも押下時に画像順を確定（commitOrder）。
// 純ロジック（パッチ構築 / 登録時タイトル必須）は lib/artwork-edit でテスト。結線は型/ビルドで担保。

export interface ArtworkFormDefaults {
  title?: string;
  description?: string;
  status?: "draft" | "published";
  isPublic?: boolean;
}

export interface ArtworkFormProps {
  /** 編集対象の id（下書きフローでは常に存在）。 */
  artworkId: string;
  /** 下書きか（true=「登録」ボタン / false=「保存」ボタン）。 */
  isDraft: boolean;
  defaults?: ArtworkFormDefaults;
  /** 既存画像（編集時のプリフィル / §6.7）。 */
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

const mutedStyle: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
};

const actionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-4)",
  marginTop: "var(--space-2)",
};

export function ArtworkForm({
  artworkId,
  isDraft,
  defaults,
  initialImages,
}: ArtworkFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // 自動保存で参照する現在のタイトル（登録時の必須チェックに使う）。
  const titleRef = useRef<string>(defaults?.title ?? "");
  const uploaderRef = useRef<ImageUploaderHandle | null>(null);

  // 画像アップローダ用：id は常に存在するのでそのまま返す（遅延作成は不要）。
  const ensureArtworkId = useCallback(
    async (): Promise<{ ok: true; id: string }> => ({ ok: true, id: artworkId }),
    [artworkId],
  );

  /** 1 フィールドの変更を自動保存する（§6.7）。控えめに保存中/失敗を表示。 */
  const autosave = useCallback(
    async <F extends AutosaveField>(field: F, value: AutosaveValue<F>) => {
      setSaveError(null);
      setSaving(true);
      const result = await updateArtworkAction(
        artworkId,
        autosavePatch(field, value),
      );
      setSaving(false);
      if (!result.ok) setSaveError("保存に失敗しました");
    },
    [artworkId],
  );

  /** プライマリボタン（下書き=登録 / 登録済み=保存）。 */
  async function onPrimary() {
    setError(null);
    setTitleError(null);

    // 登録（isDraft=false 化）時のみ実効タイトル必須（§6.7）。
    if (isDraft) {
      const titleErr = validateRegisterTitle(titleRef.current);
      if (titleErr) {
        setTitleError(titleErr);
        return;
      }
    }

    setPending(true);

    // 最新メタを反映。下書きは登録（isDraft:false）、登録済みは現タイトルの保存。
    const patch = isDraft
      ? { title: titleRef.current.trim(), isDraft: false }
      : { title: titleRef.current.trim() };
    const updated = await updateArtworkAction(artworkId, patch);
    if (!updated.ok) {
      setError(updated.error);
      setPending(false);
      return;
    }

    // 画像順を確定（複数で順序変更があった場合のみ PATCH / C3）。
    if (uploaderRef.current) {
      const ordered = await uploaderRef.current.commitOrder();
      if (!ordered.ok) {
        setError(ordered.error);
        setPending(false);
        return;
      }
    }

    setPending(false);
    router.push("/artworks");
    router.refresh();
  }

  const titleErrorId = titleError ? "title-error" : undefined;

  return (
    <div style={containerStyle}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onPrimary();
        }}
        noValidate
        style={formStyle}
      >
        {error ? (
          <p role="alert" style={errorTextStyle}>
            {error}
          </p>
        ) : null}

        <div style={fieldStyle}>
          <label htmlFor="title">タイトル{isDraft ? "" : "（必須）"}</label>
          <input
            id="title"
            type="text"
            name="title"
            defaultValue={defaults?.title ?? ""}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleErrorId}
            onChange={(e) => {
              titleRef.current = e.currentTarget.value;
              if (titleError) setTitleError(null);
            }}
            onBlur={(e) => void autosave("title", e.currentTarget.value)}
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
            onBlur={(e) => void autosave("description", e.currentTarget.value)}
          />
        </div>

        <div style={fieldStyle}>
          <label htmlFor="status">状態</label>
          <select
            id="status"
            name="status"
            defaultValue={defaults?.status ?? "draft"}
            onChange={(e) =>
              void autosave(
                "status",
                e.currentTarget.value as AutosaveValue<"status">,
              )
            }
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
            onChange={(e) => void autosave("isPublic", e.currentTarget.checked)}
          />
          <label htmlFor="isPublic">ポートフォリオに掲載する</label>
        </div>

        <ImageUploader
          artworkId={artworkId}
          {...(initialImages ? { initialImages } : {})}
          {...(defaults?.title ? { title: defaults.title } : {})}
          ensureArtworkId={ensureArtworkId}
          onReady={(h) => {
            uploaderRef.current = h;
          }}
        />

        {saving ? (
          <p role="status" style={mutedStyle} aria-live="polite">
            保存中…
          </p>
        ) : null}
        {saveError ? (
          <p role="alert" style={errorTextStyle}>
            {saveError}
          </p>
        ) : null}

        <div style={actionsStyle}>
          <button type="submit" disabled={pending}>
            {isDraft ? "登録" : "保存"}
          </button>
          <a href="/artworks">一覧へ戻る</a>
        </div>
      </form>
    </div>
  );
}
