// ローカル開発用: api(Hono) を Bun.serve で起動する。
// この環境では `wrangler dev`（workerd）がクラッシュするため、Bun で直接サーブする。
// `.dev.vars` は `bun --env-file=.dev.vars` 経由で process.env に載る → Hono の env として渡す。
//
// 使い方: apps/api ディレクトリで
//   bun --env-file=.dev.vars scripts/serve-local.ts
import app from "../src/index.ts";

const port = Number(process.env.PORT ?? 8787);
const ctx = { waitUntil() {}, passThroughOnException() {} };

const server = Bun.serve({
  port,
  idleTimeout: 60,
  fetch: (req) =>
    app.fetch(req, process.env as unknown as Record<string, string>, ctx),
});

console.log(`[serve-local] api listening on http://localhost:${server.port}`);
