import type { Context, Env, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * Better Auth の `getSession` が返す user の最小契約。
 * 認可（user_id 一致）に必要な範囲のみを公開し、スキーマ型を web へ漏らさない（ADR D5）。
 */
export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly [key: string]: unknown;
}

/**
 * Better Auth の `getSession` が返す session の最小契約。
 */
export interface SessionData {
  readonly id: string;
  readonly userId: string;
  readonly [key: string]: unknown;
}

/**
 * Hono の `Variables` に載せるセッション関連の値。
 * 未認証時は双方 null。
 */
export interface SessionVariables {
  user: SessionUser | null;
  session: SessionData | null;
}

/**
 * セッション関連ヘルパが要求する Hono 環境制約。
 * `Variables` に SessionVariables を含む任意の Env（Bindings は不問）と合成できる。
 */
type WithSession = Env & { Variables: SessionVariables };

/**
 * middleware が依存する auth の最小構造。
 * テストではモックの `{ api: { getSession } }` を注入できる（DB / 実起動を持ち込まない）。
 */
export interface AuthLike {
  api: {
    getSession: (input: {
      headers: Headers;
    }) => Promise<{ user: SessionUser; session: SessionData } | null>;
  };
}

/**
 * セッション middleware を生成する。
 *
 * `auth.api.getSession` に raw リクエストの headers（Cookie 含む）を渡し、
 * 結果から `user` / `session` を context に載せる。無ければ null（ADR D6）。
 * auth は注入式（テスト容易性 / 単一の createAuth 依存を避ける）。
 */
export function createSessionMiddleware<E extends WithSession>(
  auth: AuthLike,
): MiddlewareHandler<E> {
  return async (c, next) => {
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", result?.user ?? null);
    c.set("session", result?.session ?? null);
    await next();
  };
}

/**
 * 認証必須ルートのガード。
 * `user` が null なら 401（HTTPException）、あれば後続へ。
 */
export const requireAuth: MiddlewareHandler<WithSession> = async (
  c,
  next,
) => {
  if (c.get("user") === null) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  await next();
};

/**
 * 現在のユーザーを取得する。null なら 401 を投げる（C2 以降の CRUD で使用）。
 */
export function getCurrentUser(c: Context<WithSession>): SessionUser {
  const user = c.get("user");
  if (user === null) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  return user;
}
