"use client";

// A2 グローバルエラー境界（仕様 02 §5.2）。クライアントコンポーネント。
// 操作失敗・描画エラーを role="alert" のテキストで表示し、reset() で再試行できる。
// 専用デザインは持たず、トークン適用のみ（装飾なし）。
//
// 空状態 / ローディングは各画面側の方針（§5.2: SSR 完結ページでは原則不要、
// 空状態は一覧側で説明文 + 主要アクション導線）。ここでは部品化しない。

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <p>時間をおいて再度お試しください。</p>
      <button type="button" onClick={() => reset()}>
        再試行
      </button>
    </div>
  );
}
