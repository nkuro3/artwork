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
    <main>
      <h1>作品管理</h1>
      <p>
        <a href="/artworks/new">新規作成</a>
      </p>

      {!result.ok ? (
        <p role="alert">作品の取得に失敗しました: {result.error}</p>
      ) : result.data.length === 0 ? (
        <p>作品がまだありません。</p>
      ) : (
        <ul>
          {result.data.map((art) => (
            <li key={art.id}>
              <a href={`/artworks/edit/${art.id}`}>{art.title}</a>
              <span>
                {art.status === "published" ? "公開" : "下書き"}
                {art.isPublic ? " / 公開可" : ""}
              </span>
              <DeleteArtworkButton id={art.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
