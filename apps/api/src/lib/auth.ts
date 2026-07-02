import { account, createDb, session, user, verification } from "@artwork/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { AppBindings } from "../env";

/**
 * Better Auth サーバーインスタンスを env から生成するファクトリ。
 * `/api/auth/*` にマウントする（basePath）。email/password のみ有効。
 */
export function createAuth(env: AppBindings) {
  const db = createDb(env.DATABASE_URL);

  return betterAuth({
    database: drizzleAdapter(db, {
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
    // ローカルは web(3000) と api(8787) が別オリジン（同一サイト）のため明示的に信頼する。
    // Cookie は localhost 同士なら SameSite=Lax（デフォルト）のまま送信される。
    trustedOrigins: env.WEB_ORIGIN ? [env.WEB_ORIGIN] : [],
  });
}
