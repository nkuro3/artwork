import type { AppType } from "@artwork/api";
import { hc } from "hono/client";
import type { ArtworksClient } from "./artworks";
import type { PortfolioClient } from "./portfolio";
import type { ProfileClient } from "./profile";
import type { UploadClient } from "./upload";

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

// ── 構造的クライアント・アダプタ ────────────────────────────────
// hono RPC クライアントは Proxy でパスを実行時に組み立てるため `client.artworks.$post`
// などは実行時に必ず存在する。一方、api 側の各ルート（createArtworksRoutes 等）は
// `app.get(...)` 形式の登録で `typeof` にルートスキーマが載らず、`AppType` には
// /artworks や /uploads の静的型が現れない（C5/RPC 型公開の既知の制約。D3 の範囲外）。
//
// D3 のコア関数（lib/artworks / lib/upload）は最小の構造的インターフェースに依存する
// 設計なので、ここで実行時クライアントを一度だけそのインターフェースへ橋渡しする。
// 型の不一致は「api の RPC 型が未整備」という 1 点に閉じ込め、cast はこの 2 関数に限定する。

/** 作品 CRUD コア（lib/artworks）へ渡す構造的クライアント。 */
export function asArtworksClient(client: ApiClient): ArtworksClient {
  return client as unknown as ArtworksClient;
}

/** 画像アップロード orchestration（lib/upload）へ渡す構造的クライアント。 */
export function asUploadClient(client: ApiClient): UploadClient {
  return client as unknown as UploadClient;
}

/** 設定コア（lib/profile）へ渡す構造的クライアント（D4 / C5b 未対応の RPC 型ギャップを閉じる）。 */
export function asProfileClient(client: ApiClient): ProfileClient {
  return client as unknown as ProfileClient;
}

/** 公開ポートフォリオコア（lib/portfolio）へ渡す構造的クライアント（D5 / C5b 未対応の RPC 型ギャップを閉じる）。 */
export function asPortfolioClient(client: ApiClient): PortfolioClient {
  return client as unknown as PortfolioClient;
}
