"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserApiClient } from "../../lib/api";
import { canMove, moveItem, sameOrder } from "../../lib/reorder";
import { uploadArtworkImage } from "../../lib/upload";

// B4 画像アップロード UI（§6.6 / §6.7）。
// - ファイル選択 → ブラウザから署名 URL → R2 直 PUT → メタ作成（lib/upload は不変）。
// - アップロード中は進捗テキスト、失敗は role="alert"。複数可。サムネ一覧表示。
// - 並び替えは ↑/↓（純ロジック lib/reorder）。順序確定は既存 PATCH order API（C3）。
// - 削除は既存 DELETE /images/:id。
// アップロードには artwork id が要るため、新規作成時は親から「id を確定させる」関数
// （ensureArtworkId）を受け取り、初回アップロード時に作品を作る（遅延作成）。
// 並び順の確定（PATCH order）は親フォームの送信完了後に commitOrder() を呼んで行う。

/** クライアント側で 1 ファイルを追跡する状態。 */
interface UploadItem {
  /** ローカル一意キー（React key / 操作対象識別）。 */
  localId: string;
  /** プレビュー URL。新規=objectURL、既存=サーバーの thumbnailUrl。 */
  previewUrl: string;
  /** 既存画像か（true なら previewUrl は objectURL ではない＝revoke しない）。 */
  isExisting: boolean;
  fileName: string;
  status: "uploading" | "done" | "error";
  /** 成功時にサーバーが採番した画像 id（削除・並び替えに使う）。 */
  imageId?: string;
  error?: string;
}

/** 既存画像（編集プリフィル / B4b）。 */
export interface InitialImage {
  id: string;
  thumbnailUrl: string;
  sortOrder: number;
}

export interface ImageUploaderHandle {
  /** 並び順を確定する（親フォーム送信成功後に呼ぶ）。順序未変更や 1 枚以下なら何もしない。 */
  commitOrder: () => Promise<{ ok: true } | { ok: false; error: string }>;
}

export interface ImageUploaderProps {
  /** 既存作品の id（編集時）。未指定なら新規で、初回アップロード時に ensureArtworkId で確定する。 */
  artworkId?: string;
  /** 既存画像（編集時のプリフィル / B4b・§6.7）。sortOrder 昇順で渡す想定。 */
  initialImages?: InitialImage[];
  /** 既存画像の alt / ラベルに使う作品タイトル（§5.5）。 */
  title?: string;
  /**
   * アップロード先の artwork id を確定して返す。新規作成時は親が作品を作って id を返す。
   * 既に確定済みなら同じ id を返すだけでよい。
   */
  ensureArtworkId: () => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  /** commitOrder を親から呼べるように handle を公開する。 */
  onReady?: (handle: ImageUploaderHandle) => void;
}

// ファイル選択（枠なしネイティブ表示）。ラベルとの間・下のリストとの間に余白を確保する。
const fileInputStyle: CSSProperties = {
  display: "block",
  margin: "var(--space-2) 0 var(--space-4)",
};

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};

const itemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-4)",
  padding: "var(--space-2)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
};

const thumbStyle: CSSProperties = {
  width: "80px",
  height: "80px",
  objectFit: "cover",
  borderRadius: "var(--radius-sm)",
  flex: "0 0 auto",
};

const metaStyle: CSSProperties = {
  flex: "1 1 auto",
  minWidth: 0,
  fontSize: "var(--text-sm)",
};

const controlsStyle: CSSProperties = {
  display: "flex",
  gap: "var(--space-2)",
  flex: "0 0 auto",
};

const errorTextStyle: CSSProperties = {
  margin: `var(--space-1) 0 0`,
  fontSize: "var(--text-sm)",
  color: "var(--color-error)",
};

const mutedStyle: CSSProperties = {
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
};

let seq = 0;
function nextLocalId(): string {
  seq += 1;
  return `img-${seq}-${Date.now()}`;
}

/** 既存画像 → 初期 UploadItem（done 済み・revoke 不要）。sortOrder 昇順に整える。 */
function initialItemsFrom(
  images: InitialImage[] | undefined,
  title: string | undefined,
): UploadItem[] {
  if (!images || images.length === 0) return [];
  const label = title && title.trim() !== "" ? title : "作品画像";
  return [...images]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((img) => ({
      localId: nextLocalId(),
      previewUrl: img.thumbnailUrl,
      isExisting: true,
      fileName: label,
      status: "done" as const,
      imageId: img.id,
    }));
}

export function ImageUploader({
  artworkId,
  initialImages,
  title,
  ensureArtworkId,
  onReady,
}: ImageUploaderProps) {
  const [items, setItems] = useState<UploadItem[]>(() =>
    initialItemsFrom(initialImages, title),
  );
  // commitOrder から最新 items を読むための ref（クロージャの陳腐化防止）。
  const itemsRef = useRef<UploadItem[]>(items);
  itemsRef.current = items;
  // アップロードで確定した artwork id（新規作成後はこれを使う）。
  const resolvedIdRef = useRef<string | undefined>(artworkId);
  // 確定済みの並び順（最後に PATCH した順 or 初期順）。差分判定に使う。
  // 既存画像の現在順をシードしておく（並び替え後の差分判定の基準）。
  const committedOrderRef = useRef<string[]>(
    initialItemsFrom(initialImages, title).map((it) => it.imageId as string),
  );

  // objectURL のリーク防止（アンマウント時にまとめて revoke）。既存画像（isExisting）は
  // objectURL ではないため revoke 対象外。
  useEffect(() => {
    return () => {
      for (const it of itemsRef.current) {
        if (!it.isExisting) URL.revokeObjectURL(it.previewUrl);
      }
    };
  }, []);

  const updateItem = useCallback(
    (localId: string, patch: Partial<UploadItem>) => {
      setItems((prev) =>
        prev.map((it) => (it.localId === localId ? { ...it, ...patch } : it)),
      );
    },
    [],
  );

  const uploadOne = useCallback(
    async (localId: string, file: File) => {
      const ensured = await ensureArtworkId();
      if (!ensured.ok) {
        updateItem(localId, { status: "error", error: ensured.error });
        return;
      }
      resolvedIdRef.current = ensured.id;

      const client = createBrowserApiClient();
      const result = await uploadArtworkImage(
        { client },
        { artworkId: ensured.id, file },
      );
      if (!result.ok) {
        updateItem(localId, { status: "error", error: result.error });
        return;
      }
      const image = result.image as { id?: string };
      updateItem(localId, {
        status: "done",
        ...(image.id ? { imageId: image.id } : {}),
      });
      if (image.id) committedOrderRef.current.push(image.id);
    },
    [ensureArtworkId, updateItem],
  );

  function onSelectFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const created: UploadItem[] = [];
    for (const file of Array.from(files)) {
      const localId = nextLocalId();
      created.push({
        localId,
        previewUrl: URL.createObjectURL(file),
        isExisting: false,
        fileName: file.name,
        status: "uploading",
      });
      // 即時アップロード（id を確定 → サムネ/削除/並び替えを可能にする）。
      void uploadOne(localId, file);
    }
    setItems((prev) => [...prev, ...created]);
  }

  function onMove(index: number, direction: "up" | "down") {
    setItems((prev) => moveItem(prev, index, direction));
  }

  async function onDelete(localId: string) {
    const item = itemsRef.current.find((it) => it.localId === localId);
    if (!item) return;
    // サーバーに上がっていれば DELETE。未確定（uploading/error）はローカル除去のみ。
    if (item.imageId) {
      const client = createBrowserApiClient();
      const res = await client.api.images[":id"].$delete({
        param: { id: item.imageId },
      });
      if (!res.ok) {
        updateItem(localId, { error: "画像の削除に失敗しました" });
        return;
      }
      committedOrderRef.current = committedOrderRef.current.filter(
        (id) => id !== item.imageId,
      );
    }
    if (!item.isExisting) URL.revokeObjectURL(item.previewUrl);
    setItems((prev) => prev.filter((it) => it.localId !== localId));
  }

  // 並び順の確定（親フォーム送信成功後に呼ばれる）。確定済み画像 id を現在の表示順で送る。
  const commitOrder = useCallback(async (): Promise<
    { ok: true } | { ok: false; error: string }
  > => {
    const id = resolvedIdRef.current;
    const orderedIds = itemsRef.current
      .filter((it) => it.status === "done" && it.imageId)
      .map((it) => it.imageId as string);
    if (!id || orderedIds.length <= 1) return { ok: true };
    if (sameOrder(orderedIds, committedOrderRef.current)) return { ok: true };

    const client = createBrowserApiClient();
    const res = await client.api.artworks[":id"].images.order.$patch({
      param: { id },
      json: { orderedIds },
    });
    if (!res.ok) return { ok: false, error: "並び順の保存に失敗しました" };
    committedOrderRef.current = orderedIds;
    return { ok: true };
  }, []);

  // 親へ handle を渡す（commitOrder の最新参照）。
  useEffect(() => {
    onReady?.({ commitOrder });
  }, [onReady, commitOrder]);

  const uploading = items.some((it) => it.status === "uploading");

  return (
    <div>
      <label htmlFor="images">画像（複数選択可）</label>
      <input
        id="images"
        type="file"
        accept="image/*"
        style={fileInputStyle}
        multiple
        onChange={(e) => {
          onSelectFiles(e.currentTarget.files);
          // 同じファイルを再選択できるよう値をリセット。
          e.currentTarget.value = "";
        }}
      />
      {uploading ? (
        <p style={mutedStyle} aria-live="polite">
          アップロード中…
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul style={listStyle}>
          {items.map((it, i) => (
            <li key={it.localId} style={itemStyle}>
              <img src={it.previewUrl} alt={it.fileName} style={thumbStyle} />
              <span style={metaStyle}>
                {it.fileName}
                {it.status === "uploading" ? (
                  <span style={mutedStyle}>（アップロード中…）</span>
                ) : null}
                {it.status === "error" ? (
                  <span role="alert" style={errorTextStyle}>
                    {it.error ?? "アップロードに失敗しました"}
                  </span>
                ) : null}
              </span>
              <span style={controlsStyle}>
                <button
                  type="button"
                  onClick={() => onMove(i, "up")}
                  disabled={!canMove(items.length, i, "up")}
                  aria-label={`${it.fileName} を上へ`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onMove(i, "down")}
                  disabled={!canMove(items.length, i, "down")}
                  aria-label={`${it.fileName} を下へ`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete(it.localId)}
                  aria-label={`${it.fileName} を削除`}
                >
                  削除
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
