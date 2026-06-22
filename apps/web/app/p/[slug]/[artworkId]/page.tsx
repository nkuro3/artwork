import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { createApiClient } from "../../../../lib/api";
import {
  buildArtworkMetadata,
  findArtwork,
  getPortfolio,
  portfolioTag,
  type PortfolioDto,
} from "../../../../lib/portfolio";

// D6 作品詳細 SSR（FR-14 公開作品詳細 / FR-15 画像は詳細用大サイズ largeUrl / NFR-06）。
// 新規 api ルートは作らず、D5 と同じ C4 `GET /portfolio/:slug`（公開作品＋画像 URL を含む）
// を再利用し、その中から artworkId の作品を取り出す。取得は D5 と同じ `unstable_cache`
// （`portfolio:<slug>` タグ共有）でラップ。作品/slug 更新時に Server Action 側で
// `revalidateTag(portfolioTag(slug))` して無効化する。画面は薄く、検索・OGP 生成は
// コア（lib/portfolio: findArtwork / buildArtworkMetadata）に委譲。レンダリングは /verify。

/** slug ごとにキャッシュした公開ポートフォリオ取得（D5 と同タグ共有）。null = 未存在/失敗。 */
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
  params: Promise<{ slug: string; artworkId: string }>;
}): Promise<Metadata> {
  const { slug, artworkId } = await params;
  const portfolio = await loadPortfolio(slug);
  if (!portfolio) return {};
  const artwork = findArtwork(portfolio, artworkId);
  if (!artwork) return {};
  return buildArtworkMetadata(portfolio.profile, artwork);
}

export default async function ArtworkDetailPage({
  params,
}: {
  params: Promise<{ slug: string; artworkId: string }>;
}) {
  const { slug, artworkId } = await params;
  const portfolio = await loadPortfolio(slug);
  if (!portfolio) notFound();

  const artwork = findArtwork(portfolio, artworkId);
  if (!artwork) notFound();

  return (
    <>
      <article>
        <h1>{artwork.title}</h1>
        {artwork.description ? <p>{artwork.description}</p> : null}

        {artwork.images.map((img, i) => (
          // FR-15: 詳細は大サイズ（largeUrl）。複数画像は sort 済みで全表示。
          <img key={img.largeUrl || i} src={img.largeUrl} alt={artwork.title} />
        ))}
      </article>

      <nav>
        <a href={`/p/${slug}`}>{portfolio.profile.displayName} のポートフォリオへ戻る</a>
      </nav>
    </>
  );
}
