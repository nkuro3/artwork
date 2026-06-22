import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { createApiClient } from "../../../lib/api";
import {
  buildPortfolioMetadata,
  getPortfolio,
  portfolioTag,
  type PortfolioDto,
} from "../../../lib/portfolio";

// D5 公開ポートフォリオ SSR（FR-11〜16 / NFR-06）。公開エリアの RSC。
// C4 `GET /portfolio/:slug` は未認証なので Cookie 転送なしの `createApiClient()` で呼ぶ。
// 取得は `unstable_cache` でラップし `portfolio:<slug>` タグを付ける（NFR-06）。作品/slug
// 更新時に Server Action 側で `revalidateTag(portfolioTag(slug))` して無効化する。
// 画面は薄く、データ取得・正規化・OGP 生成はコア（lib/portfolio）に委譲。レンダリングは
// /verify で確認する（ユニットテストは next 非依存の lib/portfolio.test.ts のみ）。

/** slug ごとにキャッシュした公開ポートフォリオ取得（NFR-06）。null = 未存在/失敗。 */
function loadPortfolio(slug: string): Promise<PortfolioDto | null> {
  return unstable_cache(
    async () => {
      const client = createApiClient();
      const result = await getPortfolio(client, slug);
      return result.ok ? result.data : null;
    },
    ["portfolio", slug],
    { tags: [portfolioTag(slug)] },
  )();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const portfolio = await loadPortfolio(slug);
  if (!portfolio) return {};
  return buildPortfolioMetadata(portfolio);
}

export default async function PortfolioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const portfolio = await loadPortfolio(slug);
  if (!portfolio) notFound();

  const { profile, artworks } = portfolio;

  return (
    <main>
      <header>
        <h1>{profile.displayName}</h1>
        {profile.bio ? <p>{profile.bio}</p> : null}
      </header>

      {artworks.length === 0 ? (
        <p>公開中の作品はまだありません。</p>
      ) : (
        <ul>
          {artworks.map((art) => {
            const thumb = art.images[0]?.thumbnailUrl;
            return (
              <li key={art.id}>
                <a href={`/p/${slug}/${art.id}`}>
                  {/* FR-15: 一覧はサムネサイズ（thumbnailUrl）。 */}
                  {thumb ? (
                    <img src={thumb} alt={art.title} loading="lazy" />
                  ) : null}
                  <span>{art.title}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
