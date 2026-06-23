import Link from "next/link";

// A2 グローバル 404（仕様 02 §5.2）。専用デザインは持たず、トークン適用のみ。
// 「ページが見つかりません」+ ホームへ戻る導線。

export default function NotFound() {
  return (
    <>
      <h1>ページが見つかりません</h1>
      <p>お探しのページは存在しないか、移動した可能性があります。</p>
      <p>
        <Link href="/">ホームへ戻る</Link>
      </p>
    </>
  );
}
