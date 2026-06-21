import { apiBaseUrl } from "./api";

// D1 セッション取得（ADR D6 / D5）。
// web は Better Auth クライアント（DB アクセス）を持たず、受信 Cookie を api の
// `GET /api/auth/get-session` に転送してセッションを解決する。
// スキーマ型は web に持ち込まず、最小の `SessionUser` だけを公開する（ADR D5）。

/**
 * 認証済みユーザーの最小表現。認可・表示に必要な範囲のみ（Drizzle スキーマ型は持ち込まない）。
 */
export interface SessionUser {
  id: string;
  email: string;
}

/** Better Auth `GET /get-session` のレスポンス（必要な部分のみ）。 */
interface GetSessionResponse {
  user?: { id?: unknown; email?: unknown } | null;
}

/**
 * 受信 Cookie を api の get-session に転送してセッションを取得する。
 *
 * - `cookie` があれば `cookie` ヘッダで転送（ADR D6）。
 * - 200 かつ `user.id`/`user.email` が揃えば `SessionUser` を返す。
 * - 非 ok / 空ボディ / user 不在 → null。
 * - `fetchImpl` 注入で next/headers 非依存にユニットテスト可能。
 */
export async function fetchSession(
  cookie: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<SessionUser | null> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (cookie) {
    headers.cookie = cookie;
  }

  const res = await fetchImpl(`${apiBaseUrl()}/api/auth/get-session`, {
    headers,
  });

  if (!res.ok) {
    return null;
  }

  let body: GetSessionResponse | null;
  try {
    body = (await res.json()) as GetSessionResponse | null;
  } catch {
    // 空ボディ / 非 JSON は未認証扱い。
    return null;
  }

  const user = body?.user;
  if (
    !user ||
    typeof user.id !== "string" ||
    typeof user.email !== "string"
  ) {
    return null;
  }

  return { id: user.id, email: user.email };
}

/**
 * RSC / Server Action 用のセッション取得ラッパ。
 * `next/headers` の `cookies()` から Cookie 文字列を組んで `fetchSession` に渡す。
 *
 * next 依存のためユニットテストは行わない（実ブラウザ確認は後続 /verify）。
 */
export async function getSession(): Promise<SessionUser | null> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const cookie = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  return fetchSession(cookie || undefined);
}
