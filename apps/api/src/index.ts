import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppBindings } from "./env";
import { createAuth } from "./lib/auth";
import { artworksRoute } from "./routes/artworks";
import { imagesRoute } from "./routes/images";

const app = new Hono<{ Bindings: AppBindings }>();

// ローカルのみ CORS（web:3000 → api:8787）。本番は同一オリジンなので WEB_ORIGIN 未設定。
app.use("/api/*", async (c, next) => {
  if (!c.env.WEB_ORIGIN) return next();
  return cors({ origin: c.env.WEB_ORIGIN, credentials: true })(c, next);
});

app.get("/api/health", (c) => c.json({ ok: true }));

// Better Auth のハンドラ（サインアップ / サインイン / セッション / サインアウト等すべて）。
app.on(["GET", "POST"], "/api/auth/*", (c) =>
  createAuth(c.env).handler(c.req.raw),
);

// RPC 型を web に渡すため、ルートはチェーンで登録する。
const _routes = app
  .route("/api/artworks", artworksRoute)
  .route("/api/images", imagesRoute);

export default app;
export type AppType = typeof _routes;
