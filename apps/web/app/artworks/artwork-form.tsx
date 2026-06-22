"use client";

import type { CSSProperties } from "react";
import { useCallback, useRef, useState } from "react";
import { updateArtworkAction } from "./actions";
import {
  autosavePatch,
  validatePublishTitle,
  type AutosaveField,
  type AutosaveValue,
} from "../../lib/artwork-edit";
import type { ArtworkStatus } from "../../lib/artworks";
import {
  ImageUploader,
  type ImageUploaderHandle,
  type InitialImage,
} from "./image-uploader";

// B4 作品編集フォーム（§6.7 / ADR D12）。下書きフローに集約：artworkId は常に存在する前提。
// - 自動保存のみ（保存/登録ボタンは持たない）。タイトル/説明は blur 時、状態(select)は change 時に、
//   変更フィールドのみ PATCH（updateArtworkAction）で随時保存する。保存中/失敗は控えめに表示。
// - 状態 select = 下書き/公開/アーカイブ（draft/published/archived）。`公開`(published)へ変更時は
//   タイトル必須を client 検証し、空なら select を元の状態に戻して保存しない（フィールドエラー表示）。
// - 画像は従来どおり ImageUploader（選択時保存・並び替え）。順序確定（commitOrder）も自動で行う。
// - `一覧へ戻る` リンクのみ。
// 純ロジック（パッチ構築 / 公開時タイトル必須）は lib/artwork-edit でテスト。結線は型/ビルドで担保。

export interface ArtworkFormDefaults {
  title?: string;
  description?: string;
  status?: ArtworkStatus;
}

export interface ArtworkFormProps {
  /** 編集対象の id（下書きフローでは常に存在）。 */
  artworkId: string;
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

const errorTextStyle: CSSProperties = {
  margin: "var(--space-1) 0 0",
  fontSize: "var(--text-sm)",
  color: "var(--color-error)",
};

const mutedStyle: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
};

const navStyle: CSSProperties = {
  marginTop: "var(--space-2)",
};

export function ArtworkForm({
  artworkId,
  defaults,
  initialImages,
}: ArtworkFormProps) {
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 自動保存で参照する現在のタイトル（公開時の必須チェックに使う）。
  const titleRef = useRef<string>(defaults?.title ?? "");
  // 現在保存済みの状態（公開取り消し＝select を元に戻すために保持）。
  const [status, setStatus] = useState<ArtworkStatus>(
    defaults?.status ?? "draft",
  );
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
      if (!result.ok) {
        setSaveError("保存に失敗しました");
        return false;
      }
      return true;
    },
    [artworkId],
  );

  /** 状態 select の変更（§6.7）。公開へはタイトル必須を client 検証してから保存。 */
  const onStatusChange = useCallback(
    async (next: ArtworkStatus) => {
      setTitleError(null);
      if (next === "published") {
        const titleErr = validatePublishTitle(titleRef.current);
        if (titleErr) {
          // 公開にできないので select を元の状態に戻し、保存しない（§6.7）。
          setTitleError(titleErr);
          return;
        }
      }
      const prev = status;
      setStatus(next);
      const okSaved = await autosave("status", next);
      // 保存失敗時は表示状態を元に戻す（楽観更新の取り消し）。
      if (!okSaved) setStatus(prev);
    },
    [autosave, status],
  );

  const titleErrorId = titleError ? "title-error" : undefined;

  return (
    <div style={containerStyle}>
      <form noValidate style={formStyle} onSubmit={(e) => e.preventDefault()}>
        <div style={fieldStyle}>
          <label htmlFor="title">タイトル</label>
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
            value={status}
            onChange={(e) =>
              void onStatusChange(e.currentTarget.value as ArtworkStatus)
            }
          >
            <option value="draft">下書き</option>
            <option value="published">公開</option>
            <option value="archived">アーカイブ</option>
          </select>
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

        <nav style={navStyle}>
          <a href="/artworks">一覧へ戻る</a>
        </nav>
      </form>
    </div>
  );
}
