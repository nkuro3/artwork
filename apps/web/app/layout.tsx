import type { ReactNode } from "react";

import { SiteHeader } from "../components/site-header";
import "./globals.css";

// A2 共通レイアウト（仕様 02 §5.1）。
// 全ページ共通の SiteHeader（認証状態別ナビ）+ コンテナ幅の <main> で children をラップ。
// <main> はページ唯一のランドマーク（各 page は <main> を持たず中身だけを返す）。
//
// SiteHeader が getSession()（next/headers の cookies）を呼ぶため全ページ動的。
// 公開ポートフォリオ等の本文キャッシュは各画面側の unstable_cache で別途扱う（ADR / NFR-06）。

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <SiteHeader />
        <main
          style={{
            maxWidth: "var(--container)",
            margin: "0 auto",
            padding: "var(--space-8) var(--space-4)",
          }}
        >
          {children}
        </main>
      </body>
    </html>
  );
}
