# apps/web

Next.js フロントエンド。App Router。Cloudflare Workers にデプロイ。

## 注意点

- キャッシュ: `unstable_cache` + `revalidateTag` を使う。`use cache` / `cacheComponents` は Cloudflare/OpenNext が安定するまで使わない
- Server Actions は Cloudflare Workers 互換の範囲で使う
- Cloudflare Workers の制約 (Node.js API 非対応) に注意

## API との連携

- `apps/api` の Hono RPC クライアントを使う
- 型は `@artwork/shared` 経由で共有
