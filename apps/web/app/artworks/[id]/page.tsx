"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  api,
  type Artwork,
  type ArtworkImage,
  imageFileUrl,
} from "../../../lib/api";

const dims = (a: Artwork) => {
  const parts = [a.heightMm, a.widthMm, a.depthMm];
  if (parts.every((p) => p === null)) return null;
  return parts.map((p) => (p === null ? "?" : p)).join(" × ") + " mm";
};

export default function ArtworkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [images, setImages] = useState<ArtworkImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.api.artworks[":id"]
      .$get({ param: { id } })
      .then(async (res) => {
        if (!res.ok) {
          setError(
            res.status === 404
              ? "作品が見つかりません"
              : res.status === 401
                ? "サインインしてください"
                : `読み込みに失敗しました (${res.status})`,
          );
          return;
        }
        const body = (await res.json()) as unknown as {
          artwork: Artwork;
          images: ArtworkImage[];
        };
        setArtwork(body.artwork);
        setImages(body.images ?? []);
      })
      .catch(() => setError("読み込みに失敗しました"));
  }, [id]);

  async function handleDelete() {
    if (!window.confirm("この作品を削除しますか？")) return;
    setDeleting(true);
    const res = await api.api.artworks[":id"].$delete({ param: { id } });
    setDeleting(false);
    if (!res.ok) {
      setError(`削除に失敗しました (${res.status})`);
      return;
    }
    router.push("/artworks");
    router.refresh();
  }

  return (
    <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <h1>{artwork?.title ?? "作品詳細"}</h1>
      <div style={{ display: "flex", gap: 16 }}>
        <Link href="/artworks">一覧へ戻る</Link>
        {artwork && <Link href={`/artworks/${artwork.id}/edit`}>編集</Link>}
        {artwork && (
          <button type="button" onClick={handleDelete} disabled={deleting}>
            削除
          </button>
        )}
      </div>
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
            <li key={img.id}>
              <img
                src={imageFileUrl(img, 240)}
                alt=""
                width={240}
                style={{ display: "block", height: "auto" }}
              />
            </li>
          ))}
        </ul>
      )}
      {artwork && (
        <table style={{ borderCollapse: "collapse" }}>
          <tbody>
            {(
              [
                ["説明", artwork.description],
                ["ステータス", artwork.status || null],
                ["公開状態", artwork.publicStatus],
                ["画材・素材", artwork.medium],
                ["作品種別", artwork.artType],
                ["状態", artwork.condition],
                ["寸法 (H×W×D)", dims(artwork)],
                ["重量", artwork.weightG !== null ? `${artwork.weightG} g` : null],
                ["作成日", new Date(artwork.createdAt).toLocaleString("ja-JP")],
                ["更新日", new Date(artwork.updatedAt).toLocaleString("ja-JP")],
              ] as const
            ).map(([label, value]) => (
              <tr key={label}>
                <th style={{ textAlign: "left", padding: "4px 16px 4px 0", verticalAlign: "top" }}>
                  {label}
                </th>
                <td style={{ padding: "4px 0", whiteSpace: "pre-wrap" }}>{value ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
