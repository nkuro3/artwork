import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
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
  type PortfolioMineRoutesDeps,
  createPortfolioMineRoutes,
} from "./routes/portfolio-mine";
import {
  type PortfolioRoutesDeps,
  createPortfolioRoutes,
} from "./routes/portfolio";
import {
  type ProfileRoutesDeps,
  createProfileRoutes,
} from "./routes/profile";
import { type SearchRoutesDeps, createSearchRoutes } from "./routes/search";
// 公開 DTO 型を `@artwork/shared` 経由で web に渡すため re-export する（NFR-11 / ADR D5）。
export type {
  SearchArtistDto,
  SearchArtworkDto,
  SearchResponseDto,
} from "./routes/search";
import { createArtistProfileRepository } from "./repositories/artist-profile-repository";
import { createArtworkRepository } from "./repositories/artwork-repository";
import { createArtworkImageRepository } from "./repositories/image-repository";
import { createPortfolioRepository } from "./repositories/portfolio-repository";
import { createPortfolioItemRepository } from "./repositories/portfolio-item-repository";
import { createSearchRepository } from "./repositories/search-repository";
import { createStorageClient } from "./lib/storage";

// api Worker のエントリ。
// Better Auth は /api/auth/* にマウント（ADR D6）、CRUD は /api/artworks 等（Phase C / NFR-11）。
// 本番は同一オリジン・パスルーティングで /api/* のみ api Worker に届くため全ルートを /api 配下に置く（ADR D4）。
type AppEnv = {
  Bindings: AppBindings;
  Variables: SessionVariables & {
    artworksDeps?: ArtworksRoutesDeps;
    imageDeps?: ImageRoutesDeps;
    portfolioDeps?: PortfolioRoutesDeps;
    portfolioMineDeps?: PortfolioMineRoutesDeps;
    searchDeps?: SearchRoutesDeps;
    profileDeps?: ProfileRoutesDeps;
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

// ポートフォリオ編集（§6.12 / FR-12,13 / SEC-01）の deps。認証必須ルートのため
// セッション解決後に置く。所有者検証・published 検証はルート層で担保（ADR D8）。
const portfolioMineDepsMiddleware: MiddlewareHandler<AppEnv> = async (
  c,
  next,
) => {
  const db = createDb(c.env.DATABASE_URL);
  c.set("portfolioMineDeps", {
    portfolioItemRepo: createPortfolioItemRepository(db),
    imageBaseUrl: c.env.IMAGE_BASE_URL,
  });
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
    // 一覧の先頭画像サムネ URL 組み立て（B5 / 02 §6.5）。
    imageBaseUrl: c.env.IMAGE_BASE_URL,
  });
  await next();
};

// 画像（C3 / FR-06,07 / NFR-02）の deps。署名 URL 発行・メタ作成・削除・並び替えで使う。
// repo / storage は env 依存のためリクエストごとに deps を生成して context に載せる。
// 所有者検証はルート層の assertOwner で担保（SEC-01）。FR-07 の R2 削除は storage 経由。
// 注意: ルート mount より前に登録する（mount 後の use は当該パスのハンドラ前に走らない）。
// プロフィール（C7 / FR-03,11 / SEC-01）の deps。GET の lazy init / PATCH の更新で使う。
// repo は env(DATABASE_URL) 依存のためリクエストごとに生成して context に載せる。
// 認証必須ルートのためセッション middleware より「後」に置く。
const profileDepsMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const db = createDb(c.env.DATABASE_URL);
  c.set("profileDeps", { profileRepo: createArtistProfileRepository(db) });
  await next();
};

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
    // 自作品の画像一覧 thumbnailUrl 組み立て（B4b / B5）。
    imageBaseUrl: c.env.IMAGE_BASE_URL,
  });
  await next();
};

// ルートはメソッドチェーンで合成する。チェーンしないと `typeof app` に各ルートの
// 入出力型が載らず、web（D1）の `hc<AppType>()` 型付きアクセスが効かない（NFR-11 / ADR D5）。
// 登録順・middleware の前後関係はリファクタ前と不変に保つ。
const app = new Hono<AppEnv>()
  // Ec ローカル dev CORS（SEC-03 / D2 申し送り）。ルート群の前に最優先で適用する。
  // - origin: WEB_ORIGIN と一致したオリジンのみ許可。未設定なら CORS ヘッダを付けない
  //   （本番は同一オリジン / ADR D4 で CORS 不要 → デフォルト安全）。
  // - credentials: true（Cookie ベースのセッションを跨オリジンで送受信するため）。
  //   credentials 併用時は `*` 不可なので明示 origin を返す。
  // - localhost:3000 と :8787 は same-site のため SameSite=Lax のままで Cookie は通る（SameSite=None 不要）。
  .use("*", (c, next) => {
    const allowed = c.env?.WEB_ORIGIN;
    // 未設定なら CORS を一切付けない（本番同一オリジンで無害 / ADR D4）。
    if (!allowed) return next();
    return cors({
      origin: (origin) => (origin === allowed ? origin : null),
      credentials: true,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    })(c, next);
  })
  // ヘルスチェックは認証も Better Auth も不要（疎通確認用 / A1）。
  // 本番は同一オリジン・パスルーティングで /api/* のみ api Worker に届く（ADR D4）。
  .get("/api/health", (c) => c.json({ status: "ok" }))
  // Better Auth のハンドラを /api/auth/* にマウント。
  // （サインアップ/サインイン等。セッション middleware はここでは不要。）
  .on(["POST", "GET"], "/api/auth/*", (c) =>
    createAuth(c.env).handler(c.req.raw),
  )
  // ポートフォリオ編集 API（§6.12 / FR-12,13 / 要ログイン / SEC-01）。
  // 静的 `/mine` を公開 `:slug` より「先に」登録して衝突を避ける（ADR D12）。
  // 認証必須のためここだけセッションを解決し、編集 deps を載せる。
  .use("/api/portfolio/mine", (c, next) =>
    createSessionMiddleware<AppEnv>(createAuth(c.env))(c, next),
  )
  .use("/api/portfolio/mine", portfolioMineDepsMiddleware)
  .route("/api/portfolio", createPortfolioMineRoutes())
  // 公開ポートフォリオ（C4 / FR-11,12,13,15 / NFR-06）。未認証読み取り。
  .use("/api/portfolio/*", portfolioDepsMiddleware)
  .route("/api/portfolio", createPortfolioRoutes())
  // 公開検索（C5 / FR-17 / NFR-05 / NFR-06）。未認証の公開ディスカバリ。
  // createSearchRoutes 内は GET /search なので /api マウントで /api/search になる。
  .use("/api/search", searchDepsMiddleware)
  .route("/api", createSearchRoutes())
  // 以降のアプリルート（Phase C の CRUD 等）はセッションを解決して
  // user / session を context に載せる（無ければ null / ADR D6）。
  .use("*", (c, next) =>
    createSessionMiddleware<AppEnv>(createAuth(c.env))(c, next),
  )
  .use("/api/profile", profileDepsMiddleware)
  .use("/api/artworks/*", artworksDepsMiddleware)
  .use("/api/uploads/*", imageDepsMiddleware)
  .use("/api/images/*", imageDepsMiddleware)
  .use("/api/artworks/*", imageDepsMiddleware)
  // C7 プロフィール API（GET lazy init / PATCH 更新 / FR-03,11 / SEC-01）。
  .route("/api/profile", createProfileRoutes())
  // C2 作品 CRUD。
  .route("/api/artworks", createArtworksRoutes())
  // 画像ルートは /api 配下にマウントする（/api/uploads/sign・/api/images/:id・/api/artworks/:id/images*）。
  // C2 の /api/artworks（/、/:id）とはパス深度が異なり衝突しない（Hono は登録順 + パスで解決）。
  .route("/api", createImageRoutes());

/**
 * Hono RPC クライアント用のアプリ型（NFR-11 / ADR D5）。
 * `@artwork/shared` から再公開し、web（D1）が `hc<AppType>()` で型付きアクセスする。
 */
export type AppType = typeof app;

export default app;
