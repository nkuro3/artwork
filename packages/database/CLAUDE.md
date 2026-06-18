# packages/database

Drizzle ORM + drizzle-kit。Neon (PostgreSQL) への接続を管理。

## ルール

- スキーマ変更は必ず `src/schema.ts` を編集してから `bun run db:generate` でマイグレーション生成
- `drizzle-kit push` は開発時のみ。本番は `drizzle-kit migrate`
- pg_trgm / GIN インデックス / RLS / PostgreSQL 拡張は migration SQL に手書きで追記する
- Better Auth の認証テーブルも Drizzle スキーマで管理する (`src/schema.ts` に含める)
- `DATABASE_URL` は環境変数から取得 (`.env.local` / Cloudflare シークレット)

## マイグレーション

- `migrations/` に生成される SQL が正規のマイグレーション
- 手動で SQL を追記する場合はファイル末尾に追記し、コメントで区別する
