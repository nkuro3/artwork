import type { CSSProperties } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createApiClient } from "../../lib/api";
import { listArtworks } from "../../lib/artworks";
import { getSession } from "../../lib/session";
import { DeleteArtworkButton } from "./delete-button";

// D3 作品一覧/管理（FR-05）。要ログイン領域の RSC。
// 受信 Cookie を api に転送して `listArtworks` を呼ぶ（ADR D6 / D7：web は DB に触れない）。
// 画面は薄く、データ取得・正規化はコア（lib/artworks）に委譲。レンダリングテストは
// 行わず /verify で確認する。

export const dynamic = "force-dynamic";

// B3b: 一覧データ（lib/artworks の Artwork）に api が付与する先頭画像サムネ
// （thumbnailUrl）を各カードに出す（§6.5）。幅100%・アスペクト維持（§4/§5.4）、
// alt にタイトル（§5.5）。thumbnailUrl が null/無しなら画像は出さない。装飾なし。

const thumbStyle: CSSProperties = {
  width: "100%",
  height: "auto",
};

const cardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  padding: "var(--space-4)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
};

const metaStyle: CSSProperties = {
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
};

const actionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-4)",
  marginTop: "auto",
  paddingTop: "var(--space-2)",
};

const emptyStyle: CSSProperties = {
  color: "var(--color-text-muted)",
};

export default async function ArtworksPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const store = await cookies();
  const cookie = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const client = createApiClient(cookie ? { cookie } : {});
  const result = await listArtworks(client);

  return (
    <>
      <h1>作品管理</h1>
      <p>
        <a href="/artworks/new">新規作成</a>
      </p>

      {!result.ok ? (
        <p role="alert">作品の取得に失敗しました: {result.error}</p>
      ) : result.data.length === 0 ? (
        <p style={emptyStyle}>
          作品がまだありません。<a href="/artworks/new">新規作成</a>
        </p>
      ) : (
        <ul className="artwork-grid">
          {result.data.map((art) => (
            <li key={art.id} style={cardStyle}>
              {art.thumbnailUrl ? (
                // ワイヤー品質。Cloudflare Images の変換 URL を素の img で出す（§5.4）。
                <img src={art.thumbnailUrl} alt={art.title} style={thumbStyle} />
              ) : null}
              <a href={`/artworks/edit/${art.id}`}>{art.title}</a>
              <span style={metaStyle}>
                {art.status === "published" ? "公開" : "下書き"}
                {art.isPublic ? " / 公開可" : " / 非公開"}
              </span>
              <span style={actionsStyle}>
                <a href={`/artworks/edit/${art.id}`}>編集</a>
                <DeleteArtworkButton id={art.id} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
