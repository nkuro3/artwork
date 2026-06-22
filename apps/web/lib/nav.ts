// A2 共通ナビゲーション（仕様 02 §5.1）。
// 認証状態でヘッダー右リンクを出し分ける純ロジック。レンダリング非依存に保ち、
// ヘッダー（サーバーコンポーネント）はこの結果を map するだけにする。

export interface NavLink {
  label: string;
  href: string;
}

/**
 * ヘッダー右側のナビリンクを返す（§5.1）。
 * - 未ログイン: `ログイン`(/login) / `登録`(/signup)
 * - ログイン済み: `作品管理`(/artworks) / `設定`(/settings) / `ログアウト`(/logout)
 */
export function headerNavLinks(isAuthenticated: boolean): NavLink[] {
  if (isAuthenticated) {
    return [
      { label: "作品管理", href: "/artworks" },
      { label: "設定", href: "/settings" },
      { label: "ログアウト", href: "/logout" },
    ];
  }
  return [
    { label: "ログイン", href: "/login" },
    { label: "登録", href: "/signup" },
  ];
}
