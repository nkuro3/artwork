import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "@artwork/database";
import { artistProfile } from "@artwork/database/schema";
import type { AppBindings } from "./env";
import { createAuth } from "./lib/auth";
import {
  type SessionVariables,
  createSessionMiddleware,
} from "./lib/session";
import {
  type ArtworksRoutesDeps,
  createArtworksRoutes,
} from "./routes/artworks";
import { createArtworkRepository } from "./repositories/artwork-repository";

// api Worker のエントリ。
// Better Auth は /api/auth/* にマウント（ADR D6）、CRUD は /artworks 等（Phase C / NFR-11）。
type AppEnv = {
  Bindings: AppBindings;
  Variables: SessionVariables & { artworksDeps?: ArtworksRoutesDeps };
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

// 作品 CRUD（C2 / FR-05,07,08,09,10）。repo は env(DATABASE_URL) 依存のため
// リクエストごとに deps を生成して context に載せる（セッションは前段で解決済み）。
// 所有者検証はルート層の assertOwner で担保（SEC-01）。
app.use("/artworks/*", async (c, next) => {
  const db = createDb(c.env.DATABASE_URL);
  c.set("artworksDeps", {
    repo: createArtworkRepository(db),
    resolveArtistProfileId: async (userId) => {
      const rows = await db
        .select({ id: artistProfile.id })
        .from(artistProfile)
        .where(eq(artistProfile.userId, userId))
        .limit(1);
      return rows[0]?.id ?? null;
    },
  });
  await next();
});
app.route("/artworks", createArtworksRoutes());

export default app;
