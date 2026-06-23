import Link from "next/link";

// B4 作品編集の 404（仕様 02 §6.7）。他人の作品 / 存在しない id は notFound() で
// ここに落ちる。仕様文言「作品が見つかりません」+ 一覧へ戻る導線。装飾なし。

export default function ArtworkEditNotFound() {
  return (
    <>
      <h1>作品が見つかりません</h1>
      <p>指定された作品は存在しないか、編集する権限がありません。</p>
      <p>
        <Link href="/artworks">作品管理へ戻る</Link>
      </p>
    </>
  );
}
