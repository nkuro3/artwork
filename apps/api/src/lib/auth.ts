import {
  account,
  createDb,
  session,
  user,
  verification,
} from "@artwork/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { AppBindings } from "../env";
import { createArtistProfileRepository } from "../repositories/artist-profile-repository";
import { generateProvisionalSlug } from "./slug";

/**
 * Better Auth サーバーインスタンスを env から生成するファクトリ（ADR D6）。
 *
 * - `/api/auth/*` にマウントする想定（`basePath`）。
 * - email/password を有効化し、メール検証は必須にしない（ADR D6 / FR-01,02）。
 * - DB は `@artwork/database` の `createDb()` 経由のみ（生 neon/drizzle を直接呼ばない）。
 * - schema は Better Auth の認証テーブル（user/session/account/verification）を渡す。
 *
 * DB / env を必要とするため、テストでは呼び出さない（型と構成の正しさのみ担保）。
 */
export function createAuth(env: AppBindings) {
  const db = createDb(env.DATABASE_URL);
  const profileRepo = createArtistProfileRepository(db);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    // FR-03（サインアップ直後の初期化）: user 作成後に artist_profile を仮 slug で作成する。
    // hook 名/シグネチャは @better-auth/core 1.6.20 の BetterAuthOptions
    // (`databaseHooks.user.create.after`) で確認済み。
    // lazy init（GET /profile）と二重で発火しても冪等になるよう、既存があれば作らない。
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            const existing = await profileRepo.getByUserId(createdUser.id);
            if (existing) return;
            await profileRepo.create({
              userId: createdUser.id,
              slug: generateProvisionalSlug(createdUser.id),
              // 表示名は user.name を初期値に（設定 D4 で変更可能 / 空でも可）。
              displayName:
                typeof createdUser.name === "string" ? createdUser.name : "",
            });
          },
        },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    // クロスオリジンのブラウザ（ローカルは web :3000 → api :8787）からの
    // サインイン/サインアップを許可するため、web のオリジンを信頼する（CSRF/Origin 検証）。
    // 本番は同一オリジン（ADR D4）なので baseURL で足りるが、設定されていれば追加する。
    ...(env.WEB_ORIGIN ? { trustedOrigins: [env.WEB_ORIGIN] } : {}),
  });
}

/** Better Auth サーバーインスタンスの型。 */
export type Auth = ReturnType<typeof createAuth>;
