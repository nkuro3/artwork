"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Artwork } from "../../lib/api";

export default function ArtworksPage() {
  const [artworks, setArtworks] = useState<Artwork[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.api.artworks
      .$get()
      .then(async (res) => {
        if (res.status === 401) {
          setError("サインインしてください");
          return;
        }
        if (!res.ok) {
          setError(`読み込みに失敗しました (${res.status})`);
          return;
        }
        const body = await res.json();
        setArtworks(body.artworks as Artwork[]);
      })
      .catch(() => setError("読み込みに失敗しました"));
  }, []);

  return (
    <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <h1>作品一覧</h1>
      <div style={{ display: "flex", gap: 16 }}>
        <Link href="/artworks/new">新規作成</Link>
        <Link href="/">ホーム</Link>
      </div>
      {error && (
        <p role="alert">
          {error} <Link href="/signin">サインイン</Link>
        </p>
      )}
      {artworks && artworks.length === 0 && <p>作品がありません。</p>}
      {artworks && artworks.length > 0 && (
        <table style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 12px 4px 0" }}>タイトル</th>
              <th style={{ textAlign: "left", padding: "4px 12px 4px 0" }}>ステータス</th>
              <th style={{ textAlign: "left", padding: "4px 12px 4px 0" }}>公開状態</th>
              <th style={{ textAlign: "left", padding: "4px 12px 4px 0" }}>作成日</th>
            </tr>
          </thead>
          <tbody>
            {artworks.map((a) => (
              <tr key={a.id}>
                <td style={{ padding: "4px 12px 4px 0" }}>
                  <Link href={`/artworks/${a.id}`}>{a.title}</Link>
                </td>
                <td style={{ padding: "4px 12px 4px 0" }}>{a.status || "—"}</td>
                <td style={{ padding: "4px 12px 4px 0" }}>{a.publicStatus}</td>
                <td style={{ padding: "4px 12px 4px 0" }}>
                  {new Date(a.createdAt).toLocaleDateString("ja-JP")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
