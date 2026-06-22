import { createApiClient } from "../../lib/api";
import { type SearchDto, searchAll } from "../../lib/search";

// B6 横断検索 SSR（FR-17 / §6.9）。公開エリアの RSC（未認証で叩ける）。
// C5 `GET /api/search?q=` は未認証なので Cookie 転送なしの `createApiClient()` で呼ぶ。
// データ取得・正規化はコア（lib/search）に委譲し、画面は薄く保つ（レンダリング確認は /verify）。
// 作品→詳細リンク注記: 公開作品詳細は `/p/{作者slug}/{artworkId}` だが、C5 の
// `SearchArtworkDto` に作者 slug が無いため、作品結果はサムネ+タイトル表示に留めリンクは張らない
// （api 側 follow-up で作者 slug を DTO に追加すればリンク可能になる）。作者結果は slug があるので
// `/p/{slug}` へリンクする。

// 検索は q ごとに結果が変わる（未認証・公開）。SSR の都度取得で十分なので動的描画にする。
export const dynamic = "force-dynamic";

/** searchParams.q を 1 本の文字列に正規化（配列で来たら先頭、無ければ空）。 */
function readQuery(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return raw[0] ?? "";
  return raw ?? "";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = readQuery(rawQ);
  const trimmed = q.trim();

  const client = createApiClient();
  const result = await searchAll(client, q);

  return (
    <>
      <h1>検索</h1>

      <form method="get" action="/search" role="search">
        <label htmlFor="search-q">キーワード</label>
        <input
          id="search-q"
          type="search"
          name="q"
          defaultValue={q}
          autoComplete="off"
        />
        <button type="submit">検索</button>
      </form>

      {trimmed === "" ? (
        <p>キーワードを入力してください。</p>
      ) : !result.ok ? (
        <p role="alert">検索に失敗しました。時間をおいて再度お試しください。</p>
      ) : (
        <SearchResults data={result.data} />
      )}
    </>
  );
}

function SearchResults({ data }: { data: SearchDto }) {
  const { artworks, artists } = data;

  if (artworks.length === 0 && artists.length === 0) {
    return <p>該当がありません。</p>;
  }

  return (
    <>
      <section>
        <h2>作品</h2>
        {artworks.length === 0 ? (
          <p>該当する作品はありません。</p>
        ) : (
          // §4 グリッド列数（作品 = ≥md で2列）。
          <ul className="search-grid">
            {artworks.map((art) => (
              <li key={art.id}>
                {/* 作者 slug が DTO に無いため詳細リンクは張らず、サムネ+タイトル表示に留める。 */}
                {art.thumbnailUrl ? (
                  // §5.5: 画像 alt は作品タイトル。
                  <img src={art.thumbnailUrl} alt={art.title} loading="lazy" />
                ) : null}
                <span>{art.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>作者</h2>
        {artists.length === 0 ? (
          <p>該当する作者はありません。</p>
        ) : (
          // 作者 = リスト（§4）。slug があるので公開ポートフォリオへリンクする。
          <ul>
            {artists.map((artist) => (
              <li key={artist.slug}>
                <a href={`/p/${artist.slug}`}>{artist.displayName}</a>
                <span>{artist.slug}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
