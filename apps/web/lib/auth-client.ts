import { createAuthClient } from "better-auth/react";
import type { AuthFormsClient, AuthResult } from "./auth-forms";

// D2 認証クライアント（FR-01 / ADR D6 / D4）。
// これは Better Auth の「クライアント SDK」= HTTP クライアントであり、DB には触れない
// （D6 に反しない）。セッション解決（RSC）は別途 lib/session.ts が Cookie 転送で行う。
//
// baseURL はブラウザから見える値を使う:
//  - NEXT_PUBLIC_API_URL があればそれ（ローカル別オリジン: http://localhost:8787）
//  - 無ければ undefined を渡し、同一オリジン相対（本番 / ADR D4）。
// Better Auth の既定 basePath `/api/auth` をそのまま使う（C1 のマウントと一致）。

function authBaseUrl(): string | undefined {
  const url = process.env.NEXT_PUBLIC_API_URL;
  return url && url.length > 0 ? url : undefined;
}

export const authClient = createAuthClient({
  baseURL: authBaseUrl(),
  fetchOptions: {
    // Cookie（セッショントークン）の送受信を有効化。クロスオリジン時に必須。
    credentials: "include",
  },
});

/**
 * Better Auth の `{ data, error }`（error.message が `string | undefined`、
 * 成功/失敗で排他的な型）を `auth-forms` の最小 `AuthResult` に正規化する。
 */
function toAuthResult(res: {
  data?: unknown;
  error?: { message?: string | undefined } | null;
}): AuthResult {
  if (res.error) {
    return { error: { message: res.error.message } };
  }
  return { data: res.data ?? null };
}

/**
 * `auth-forms` の `submit*` に注入するアダプタ。
 * Better Auth の `signIn.email` / `signUp.email` / `signOut` を最小インターフェースに包む。
 */
export const authFormsClient: AuthFormsClient = {
  signIn: (input) => authClient.signIn.email(input).then(toAuthResult),
  signUp: (input) => authClient.signUp.email(input).then(toAuthResult),
  signOut: () => authClient.signOut().then(toAuthResult),
};
