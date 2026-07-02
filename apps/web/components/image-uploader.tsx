"use client";

import { type ChangeEvent, useState } from "react";
import { apiFetch, type ArtworkImage, imageFileUrl } from "../lib/api";

// 画像ファイルの寸法をブラウザで測る（失敗時は null）。
async function measure(file: File) {
  try {
    const bmp = await createImageBitmap(file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return { width: null, height: null };
  }
}

// アップロード即時で artwork_image 行（未紐付け）を作り、保存時の紐付けは
// 親フォームが images の id リストを送ることで行う。
export function ImageUploader({
  images,
  onChange,
}: {
  images: ArtworkImage[];
  onChange: (images: ArtworkImage[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);
    setUploading(true);

    const uploaded: ArtworkImage[] = [];
    for (const file of files) {
      const { width, height } = await measure(file);
      // ① presigned URL を発行（artwork_image 行が未紐付けで作られる）
      const presign = await apiFetch("/api/images", {
        method: "POST",
        body: JSON.stringify({
          contentType: file.type,
          size: file.size,
          width,
          height,
        }),
      });
      if (!presign.ok) {
        setError(`アップロード準備に失敗しました (${presign.status})`);
        continue;
      }
      const { image, uploadUrl } = (await presign.json()) as {
        image: ArtworkImage;
        uploadUrl: string;
      };
      // ② R2 へ直接 PUT（api を経由しない）
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) {
        setError(`アップロードに失敗しました (${put.status})`);
        continue; // 行は孤児として残るがクリーンアップバッチが回収する
      }
      uploaded.push(image);
    }

    setUploading(false);
    if (uploaded.length > 0) onChange([...images, ...uploaded]);
  }

  function remove(id: string) {
    onChange(images.filter((img) => img.id !== id));
  }

  return (
    <fieldset style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <legend>画像</legend>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        onChange={handleSelect}
        disabled={uploading}
      />
      {uploading && <p>アップロード中…</p>}
      {error && <p role="alert">{error}</p>}
      {images.length > 0 && (
        <ul
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {images.map((img) => (
            <li
              key={img.id}
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              <img
                src={imageFileUrl(img, 120)}
                alt=""
                width={120}
                style={{ display: "block", height: "auto" }}
              />
              <button type="button" onClick={() => remove(img.id)}>
                外す
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
