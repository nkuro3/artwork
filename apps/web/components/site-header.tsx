import Link from "next/link";

import { headerNavLinks } from "../lib/nav";
import { getSession } from "../lib/session";

// A2 共通ヘッダー（仕様 02 §5.1）。サーバーコンポーネント。
// 受信 Cookie を api に転送する getSession() で認証状態を判定し、右リンクを出し分ける。
// 全幅ヘッダー。md(768px) 未満は flex-wrap で右リンクを素直に折り返す（ハンバーガーなし）。
//
// 注意（動的性）: getSession() は next/headers の cookies() に依存するため、
// このヘッダーを含む全ページは動的レンダリングになる（リクエストごとに評価）。
// これは認証状態でヘッダーを出し分ける本仕様の要件上、意図どおり。

export async function SiteHeader() {
  const session = await getSession();
  const links = headerNavLinks(session !== null);

  return (
    <header
      style={{
        width: "100%",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div
        style={{
          maxWidth: "var(--container)",
          margin: "0 auto",
          padding: "var(--space-4)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-4)",
        }}
      >
        <Link
          href="/"
          style={{
            fontSize: "var(--text-lg)",
            fontWeight: "var(--weight-bold)",
            color: "var(--color-text)",
          }}
        >
          アートワーク
        </Link>
        <nav aria-label="メイン">
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-4)",
            }}
          >
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
