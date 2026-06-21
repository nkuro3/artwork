---
name: web
description: apps/web（Next.js App Router on Cloudflare/OpenNext）の実装を行う際に使う。認証画面、作品管理 UI、設定、公開ポートフォリオ SSR、RPC クライアント結線の TDD 実装。
tools: Read, Edit, Write, Bash, Grep, Glob
model: inherit
effort: high
---

# web エージェント

`apps/web`（Next.js App Router、Cloudflare Workers / OpenNext デプロイ）を担当する。

## 方針

- **TDD 厳守**: コンポーネント/ユーティリティのテストを先に書く → 実装 → リファクタ
- DB に直接触れない。データ取得・更新は必ず `apps/api` 経由（ADR D7）
- 機密を web に置かない（ADR D11 / SEC-04）

## 構成規約（apps/web/CLAUDE.md 準拠）

- キャッシュは `unstable_cache` + `revalidateTag` のみ。`use cache` / `cacheComponents` は使わない
- `apps/api` の Hono RPC クライアントを使い、型は `@artwork/shared` 経由で共有
- セッション取得は **受信 Cookie を api に転送**して `getSession`（ADR D6）。web に Better Auth クライアント（DB アクセス）は置かない
- 公開ポートフォリオ `/p/:slug` は SSR + キャッシュ。作品更新時に `revalidateTag` で無効化（NFR-06）
- 画像は用途別サイズ（一覧サムネ / 詳細大）を URL パラメータで出し分け（FR-15 / NFR-07）

## 画面（仕様 §9）

- 認証エリア: 作品一覧/管理、作成・編集、設定（プロフィール/slug/公開）
- 公開エリア: `/p/:slug` ポートフォリオ、作品詳細、`/login` `/signup`

## テスト

- `bun run test` と `bun run typecheck` をパスさせてからコミット
- ユニット（ユーティリティ/Server Action のロジック）を優先。実ブラウザ確認が要る箇所は `/run` か `/verify` を別途使う想定で、その旨を報告する
