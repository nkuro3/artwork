import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";
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
//
// B7 プレゼン整備（§6.10 / §4 グリッド列数 / §5.4・§5.5）: h1=表示名・bio（任意）・公開作品
// グリッド（<md=1〜2列 / ≥md=3列 = `.portfolio-grid`、media query は globals.css）。各作品は
// サムネ+タイトルを `/p/{slug}/{id}` リンクに含める。画像は幅100%・アスペクト維持・alt=タイトル。
// 装飾なし（ワイヤー品質）。データ取得・unstable_cache・generateMetadata は不変。

// 作品サムネ: 幅100%・アスペクト維持（§5.4）。
const thumbStyle: CSSProperties = {
  width: "100%",
  height: "auto",
};

// 作品カード: 縦積み（サムネ→タイトル）。トークン余白のみ、装飾なし。
const cardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

const bioStyle: CSSProperties = {
  color: "var(--color-text-muted)",
};

const emptyStyle: CSSProperties = {
  color: "var(--color-text-muted)",
};

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
    <>
      <header>
        <h1>{profile.displayName}</h1>
        {profile.bio ? <p style={bioStyle}>{profile.bio}</p> : null}
      </header>

      {artworks.length === 0 ? (
        <p style={emptyStyle}>公開作品はまだありません。</p>
      ) : (
        // §4 グリッド列数（公開ポートフォリオ: <md=1〜2列 / ≥md=3列）。
        <ul className="portfolio-grid">
          {artworks.map((art) => {
            const thumb = art.images[0]?.thumbnailUrl;
            return (
              <li key={art.id}>
                {/* 公開作品詳細 `/p/{slug}/{id}` へ。サムネ+タイトルをリンクに含める。 */}
                <Link href={`/p/${slug}/${art.id}`} style={cardStyle}>
                  {/* FR-15: 一覧はサムネサイズ（thumbnailUrl）。§5.4 幅100%/§5.5 alt=タイトル。 */}
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={art.title}
                      loading="lazy"
                      style={thumbStyle}
                    />
                  ) : null}
                  <span>{art.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
