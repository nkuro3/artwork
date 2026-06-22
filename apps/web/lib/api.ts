import type { AppType } from "@artwork/api";
import { hc } from "hono/client";

// D1 Hono RPC クライアント（NFR-11 / ADR D6 / D4）。
// 型は `@artwork/api` の `AppType` を import type で取り込み（実行時依存は持たない）、
// `hc<AppType>()` で型付きアクセスにする。Cookie 転送は RSC/Server Action から
// 受信 Cookie を渡して api の Better Auth セッションを引き継ぐため（ADR D6）。

/**
 * api のベース URL を解決する（ADR D4）。
 * - 本番は web/api 同一オリジン → `API_URL` 未設定 = 空文字（相対パス）。
 * - ローカルは別ポート → `API_URL=http://localhost:8787`。
 */
export function apiBaseUrl(): string {
  return process.env.API_URL ?? "";
}

export interface CreateApiClientOptions {
  /** RSC/Server Action から転送する受信 Cookie 文字列（ADR D6）。 */
  cookie?: string;
  /** ベース URL の明示指定（既定は `apiBaseUrl()`）。主にテスト用。 */
  baseUrl?: string;
  /** fetch の差し替え（既定はグローバル fetch）。主にテスト用。 */
  fetch?: typeof fetch;
}

/**
 * 型付き RPC クライアントを生成する。
 *
 * `cookie` を渡すと全リクエストに `cookie` ヘッダを載せる（Cookie 転送 / ADR D6）。
 * web に Better Auth クライアント（= DB アクセス）は置かず、セッション解決は
 * 受信 Cookie を api に転送して行う方針に揃える。
 */
export function createApiClient(opts: CreateApiClientOptions = {}) {
  const baseUrl = opts.baseUrl ?? apiBaseUrl();
  const headers: Record<string, string> = {};
  if (opts.cookie) {
    headers.cookie = opts.cookie;
  }

  return hc<AppType>(baseUrl, {
    headers,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
}

/** 型付き RPC クライアントの型（呼び出し側の引数注釈用）。 */
export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * ブラウザから見える api のベース URL（ADR D4）。
 * - ローカルは別オリジン → `NEXT_PUBLIC_API_URL=http://localhost:8787`。
 * - 本番は同一オリジン → 未設定 = 空文字（相対パス）。
 * `process.env.API_URL`（サーバー専用）はブラウザに露出しないため使わない。
 */
export function browserApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "";
}

/**
 * ブラウザ用の型付き RPC クライアント。Cookie は転送せず、ブラウザが
 * `credentials: include` で自動送信する（ADR D6）。画像の署名取得・メタ作成など
 * クライアントコンポーネントから api を呼ぶ用途に使う。
 */
export function createBrowserApiClient(): ApiClient {
  return hc<AppType>(browserApiBaseUrl(), {
    init: { credentials: "include" },
  });
}

// C5b: api の各ルートを Hono のメソッドチェーン記法にしたことで `AppType` に
// artworks / images / uploads / portfolio / profile の静的型が載るようになり、
// `hc<AppType>()`（= ApiClient）を各コア関数へ型付きのまま直接渡せる（NFR-11 / ADR D5）。
// 以前あった `asArtworksClient` 等の cast アダプタは不要になったため削除した。
