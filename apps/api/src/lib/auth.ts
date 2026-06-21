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
  return betterAuth({
    database: drizzleAdapter(createDb(env.DATABASE_URL), {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
  });
}

/** Better Auth サーバーインスタンスの型。 */
export type Auth = ReturnType<typeof createAuth>;
