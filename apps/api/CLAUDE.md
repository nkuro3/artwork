# apps/api

Hono on Cloudflare Workers。RPC モードで型を web と共有。

## 注意点

- Cloudflare Workers の制約に従う (Node.js built-in は基本使えない)
- 環境変数は `wrangler.toml` の `[vars]` または Cloudflare dashboard のシークレット
- DB 接続は `@artwork/database` の `createDb()` を使う
- 認証は Better Auth のサーバーサイドインスタンスを使う

## 画像処理

- 画像処理ロジックは `src/lib/image/` に隔離する
- R2 とのやり取りは `src/lib/storage.ts` に抽象化する
- 同期処理に依存しない設計にする
