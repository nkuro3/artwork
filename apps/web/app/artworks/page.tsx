import type { CSSProperties } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createApiClient } from "../../lib/api";
import { listArtworks, type ArtworkStatus } from "../../lib/artworks";
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

// 状態テキスト（§6.5）。下書き/公開/アーカイブ。
const STATUS_LABEL: Record<ArtworkStatus, string> = {
  draft: "下書き",
  published: "公開",
  archived: "アーカイブ",
};

const thumbStyle: CSSProperties = {
  width: "100%",
  height: "auto",
};

const cardStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  padding: "var(--space-4)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
};

// 非公開バッジ（§6.5）。カード右上に draft / archived を表示。トークンのみ・装飾なし。
const statusBadgeStyle: CSSProperties = {
  position: "absolute",
  top: "var(--space-2)",
  right: "var(--space-2)",
  padding: "var(--space-1) var(--space-2)",
  fontSize: "var(--text-xs)",
  color: "var(--color-text-muted)",
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
              {/* 非公開（draft/archived）はカード右上に状態バッジ。published は無し（§6.5）。 */}
              {art.status !== "published" ? (
                <span style={statusBadgeStyle}>{art.status}</span>
              ) : null}
              {art.thumbnailUrl ? (
                // ワイヤー品質。Cloudflare Images の変換 URL を素の img で出す（§5.4）。
                <img src={art.thumbnailUrl} alt={art.title} style={thumbStyle} />
              ) : null}
              <a href={`/artworks/edit/${art.id}`}>
                {art.title || "（無題）"}
              </a>
              <span style={metaStyle}>{STATUS_LABEL[art.status]}</span>
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
