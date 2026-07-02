"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArtworkForm } from "../../../../components/artwork-form";
import { api, type Artwork } from "../../../../lib/api";

export default function EditArtworkPage() {
  const { id } = useParams<{ id: string }>();
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        const body = await res.json();
        setArtwork(body.artwork as Artwork);
      })
      .catch(() => setError("読み込みに失敗しました"));
  }, [id]);

  return (
    <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <h1>作品の編集</h1>
      <Link href={`/artworks/${id}`}>詳細へ戻る</Link>
      {error && <p role="alert">{error}</p>}
      {artwork && <ArtworkForm initial={artwork} />}
    </main>
  );
}
