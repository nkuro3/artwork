// A2 共通ナビゲーション（仕様 02 §5.1）。
// 認証状態でヘッダー右リンクを出し分ける純ロジック。レンダリング非依存に保ち、
// ヘッダー（サーバーコンポーネント）はこの結果を map するだけにする。

export interface NavLink {
  label: string;
  href: string;
}

/**
 * ヘッダー右側のナビリンクを返す（§5.1）。検索は公開機能のため両状態で出す。
 * - 未ログイン: `検索`(/search) / `ログイン`(/login) / `登録`(/signup)
 * - ログイン済み: `作品管理`(/artworks) / `検索`(/search) / `設定`(/settings) / `ログアウト`(/logout)
 */
export function headerNavLinks(isAuthenticated: boolean): NavLink[] {
  if (isAuthenticated) {
    return [
      { label: "作品管理", href: "/artworks" },
      { label: "検索", href: "/search" },
      { label: "設定", href: "/settings" },
      { label: "ログアウト", href: "/logout" },
    ];
  }
  return [
    { label: "検索", href: "/search" },
    { label: "ログイン", href: "/login" },
    { label: "登録", href: "/signup" },
  ];
}
