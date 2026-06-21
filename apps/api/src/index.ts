import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
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
import { type ImageRoutesDeps, createImageRoutes } from "./routes/images";
import {
  type PortfolioRoutesDeps,
  createPortfolioRoutes,
} from "./routes/portfolio";
import { type SearchRoutesDeps, createSearchRoutes } from "./routes/search";
// 公開 DTO 型を `@artwork/shared` 経由で web に渡すため re-export する（NFR-11 / ADR D5）。
export type {
  SearchArtistDto,
  SearchArtworkDto,
  SearchResponseDto,
} from "./routes/search";
import { createArtworkRepository } from "./repositories/artwork-repository";
import { createArtworkImageRepository } from "./repositories/image-repository";
import { createPortfolioRepository } from "./repositories/portfolio-repository";
import { createSearchRepository } from "./repositories/search-repository";
import { createStorageClient } from "./lib/storage";

// api Worker のエントリ。
// Better Auth は /api/auth/* にマウント（ADR D6）、CRUD は /artworks 等（Phase C / NFR-11）。
type AppEnv = {
  Bindings: AppBindings;
  Variables: SessionVariables & {
    artworksDeps?: ArtworksRoutesDeps;
    imageDeps?: ImageRoutesDeps;
    portfolioDeps?: PortfolioRoutesDeps;
    searchDeps?: SearchRoutesDeps;
  };
};

// 公開ディスカバリ（C4 ポートフォリオ / C5 検索）の deps middleware。
// セッション middleware より「前」に置き、未認証アクセスで getSession を走らせない
// （読み取り高速化方針 / NFR-06）。deps は env(DATABASE_URL) 依存のためリクエストごとに生成。
const portfolioDepsMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const db = createDb(c.env.DATABASE_URL);
  c.set("portfolioDeps", { portfolioRepo: createPortfolioRepository(db) });
  await next();
};
const searchDepsMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const db = createDb(c.env.DATABASE_URL);
  c.set("searchDeps", { searchRepo: createSearchRepository(db) });
  await next();
};

// 作品 CRUD（C2 / FR-05,07,08,09,10）の deps。repo は env(DATABASE_URL) 依存のため
// リクエストごとに deps を生成して context に載せる（セッションは前段で解決済み）。
// 所有者検証はルート層の assertOwner で担保（SEC-01）。
const artworksDepsMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const db = createDb(c.env.DATABASE_URL);
  const storage = createStorageClient({
    accountId: c.env.R2_ACCOUNT_ID,
    accessKeyId: c.env.R2_ACCESS_KEY_ID,
    secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
    bucketName: c.env.R2_BUCKET_NAME,
  });
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
    // 削除時の R2 クリーンアップ（FR-07）。C3 と同じ repo/storage を生成する。
    imageRepo: createArtworkImageRepository(db),
    storage,
  });
  await next();
};

// 画像（C3 / FR-06,07 / NFR-02）の deps。署名 URL 発行・メタ作成・削除・並び替えで使う。
// repo / storage は env 依存のためリクエストごとに deps を生成して context に載せる。
// 所有者検証はルート層の assertOwner で担保（SEC-01）。FR-07 の R2 削除は storage 経由。
// 注意: ルート mount より前に登録する（mount 後の use は当該パスのハンドラ前に走らない）。
const imageDepsMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const db = createDb(c.env.DATABASE_URL);
  const storage = createStorageClient({
    accountId: c.env.R2_ACCOUNT_ID,
    accessKeyId: c.env.R2_ACCESS_KEY_ID,
    secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
    bucketName: c.env.R2_BUCKET_NAME,
  });
  c.set("imageDeps", {
    imageRepo: createArtworkImageRepository(db),
    artworkRepo: createArtworkRepository(db),
    storage,
  });
  await next();
};

// ルートはメソッドチェーンで合成する。チェーンしないと `typeof app` に各ルートの
// 入出力型が載らず、web（D1）の `hc<AppType>()` 型付きアクセスが効かない（NFR-11 / ADR D5）。
// 登録順・middleware の前後関係はリファクタ前と不変に保つ。
const app = new Hono<AppEnv>()
  // ヘルスチェックは認証も Better Auth も不要（疎通確認用 / A1）。
  .get("/health", (c) => c.json({ status: "ok" }))
  // Better Auth のハンドラを /api/auth/* にマウント。
  // （サインアップ/サインイン等。セッション middleware はここでは不要。）
  .on(["POST", "GET"], "/api/auth/*", (c) =>
    createAuth(c.env).handler(c.req.raw),
  )
  // 公開ポートフォリオ（C4 / FR-11,12,13,15 / NFR-06）。未認証読み取り。
  .use("/portfolio/*", portfolioDepsMiddleware)
  .route("/portfolio", createPortfolioRoutes())
  // 公開検索（C5 / FR-17 / NFR-05 / NFR-06）。未認証の公開ディスカバリ。
  .use("/search", searchDepsMiddleware)
  .route("/", createSearchRoutes())
  // 以降のアプリルート（Phase C の CRUD 等）はセッションを解決して
  // user / session を context に載せる（無ければ null / ADR D6）。
  .use("*", (c, next) =>
    createSessionMiddleware<AppEnv>(createAuth(c.env))(c, next),
  )
  .use("/artworks/*", artworksDepsMiddleware)
  .use("/uploads/*", imageDepsMiddleware)
  .use("/images/*", imageDepsMiddleware)
  .use("/artworks/*", imageDepsMiddleware)
  // C2 作品 CRUD。
  .route("/artworks", createArtworksRoutes())
  // 画像ルートはルート直下にマウントする（/uploads/sign・/images/:id・/artworks/:id/images*）。
  // C2 の /artworks（/、/:id）とはパス深度が異なり衝突しない（Hono は登録順 + パスで解決）。
  .route("/", createImageRoutes());

/**
 * Hono RPC クライアント用のアプリ型（NFR-11 / ADR D5）。
 * `@artwork/shared` から再公開し、web（D1）が `hc<AppType>()` で型付きアクセスする。
 */
export type AppType = typeof app;

export default app;
