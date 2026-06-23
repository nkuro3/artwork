import type { CSSProperties } from "react";

/**
 * Profile Slug を `@{slug}` 形式で表示し、公開プロフィール（`/p/{slug}`）へリンクする（§6.8）。
 * データ（`artist_profile.slug`）は `@` を含まず、表示時のみ `@` を付ける（通例のハンドル表記）。
 */
export function ProfileSlugLink({
  slug,
  style,
}: {
  slug: string;
  style?: CSSProperties;
}) {
  return (
    <a href={`/p/${slug}`} style={style}>
      @{slug}
    </a>
  );
}
