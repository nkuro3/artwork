# artwork

アート管理プラットフォーム。フェーズ0 = 作品管理 / ポートフォリオ / サブスクリプションの最小プロダクト。

## スタック

- **実行環境**: Cloudflare Workers
- **パッケージマネージャ**: bun / bun workspaces + Turborepo
- **フロントエンド**: Next.js (apps/web)
- **API**: Hono on Cloudflare Workers (apps/api)、RPC で型共有
- **認証**: Better Auth (Drizzle アダプタ、認証テーブルも同一スキーマ)
- **DB**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM + drizzle-kit (マイグレーションは素の SQL、pg_trgm/GIN/RLS/拡張も migration に手書き)
- **ストレージ**: Cloudflare R2
- **画像処理**: Cloudflare Images (R2 をオリジンに変換)
- **決済**: Stripe

## リポジトリ構成

- `apps/web` — Next.js フロントエンド
- `apps/api` — Hono API (Cloudflare Workers)
- `packages/database` — Drizzle スキーマ・マイグレーション (共有)
- `packages/ui` — 共通 UI コンポーネント
- `packages/shared` — 型・ユーティリティ
- `packages/config` — ESLint/TS 共通設定
- `docs/specs/` — 仕様書
- `docs/tips/` — AI 駆動開発の知見 (tips → .claude/rules/ へ昇華)
- `.claude/` — Claude Code ハーネス

## 開発方針

- 「未知を抱えない / 普通の選択 / 低メンテ」を優先
- spec-driven: 仕様 → 計画 → タスク化 → 実装。各段階で開発者承認
- 実験的機能は本番に入れない
- コマンドは `bun run <script>`

## ドキュメント体系

- `CLAUDE.md` — 常時の文脈 (短く保つ)
- `.claude/rules/` — 確立済みルール
- `docs/tips/` — 知見の蓄積口 (体系化されたら rules/ へ)
- `docs/specs/` — 仕様書置き場
