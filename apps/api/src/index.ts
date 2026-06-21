import { Hono } from "hono";
import type { AppBindings } from "./env";
import { createAuth } from "./lib/auth";
import {
  type SessionVariables,
  createSessionMiddleware,
} from "./lib/session";

// api Worker のエントリ。
// Better Auth は /api/auth/* にマウント（ADR D6）、CRUD は /artworks 等（Phase C / NFR-11）。
type AppEnv = {
  Bindings: AppBindings;
  Variables: SessionVariables;
};

const app = new Hono<AppEnv>();

// ヘルスチェックは認証も Better Auth も不要（疎通確認用 / A1）。
app.get("/health", (c) => c.json({ status: "ok" }));

// Better Auth のハンドラを /api/auth/* にマウント。
// （サインアップ/サインイン等。セッション middleware はここでは不要。）
app.on(["POST", "GET"], "/api/auth/*", (c) =>
  createAuth(c.env).handler(c.req.raw),
);

// 以降のアプリルート（Phase C の CRUD 等）はセッションを解決して
// user / session を context に載せる（無ければ null / ADR D6）。
app.use("*", (c, next) =>
  createSessionMiddleware<AppEnv>(createAuth(c.env))(c, next),
);

export default app;
