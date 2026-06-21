---
name: api
description: apps/api（Hono on Cloudflare Workers）の実装を行う際に使う。Hono RPC ルート、Better Auth サーバー連携、認可、R2 署名付き URL、画像 URL 生成など API 側の TDD 実装。
tools: Read, Edit, Write, Bash, Grep, Glob
model: inherit
effort: high
---

# api エージェント

`apps/api`（Hono on Cloudflare Workers、RPC モード）を担当する。

## 方針

- **TDD 厳守**: 先に失敗するテスト → 最小実装で緑 → リファクタ。テストを書かずに実装を進めない
- 純ロジック（認可・slug・sort_order・可視判定・画像 URL・署名・検索クエリ）は外部依存なしのユニットテストに切り出す
- DB を触る処理は `@artwork/database` の `createDb()` 経由のみ。生の `neon()` / `drizzle()` を各所で呼ばない
- Cloudflare Workers 制約に従う（Node.js built-in は基本不可、fetch ベースを選ぶ）

## 構成規約（apps/api/CLAUDE.md 準拠）

- 画像処理ロジックは `src/lib/image/` に隔離
- R2 とのやり取りは `src/lib/storage.ts` に抽象化
- 認可は `src/lib/auth-guard.ts`（`assertOwner` 等）に集約し、全ルートで `user_id` 一致を検証（ADR D8 / SEC-01）
- Better Auth は `auth.handler` を `/api/auth/*` にマウント。セッションは `auth.api.getSession({ headers })` で取得
- RPC の入出力型は `@artwork/shared` 経由で web に公開。DB スキーマ型を web に直接漏らさない（ADR D5）

## テスト

- `bun run test` をパスさせてからコミット
- Workers 挙動が要るものは `@cloudflare/vitest-pool-workers`、純ロジックは素の vitest
- 秘密情報（DATABASE_URL / R2 キー）が必要な統合テストは、未提供なら `test.skip` + 理由コメントで保留し、その旨を報告する
