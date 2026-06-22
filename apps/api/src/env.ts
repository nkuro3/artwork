/**
 * Cloudflare Worker の env（Bindings）型。
 *
 * 値は wrangler.toml の `[vars]` または Cloudflare のシークレットで供給される。
 * Better Auth / DB / R2 / 画像変換に必要な最小集合を定義する。
 */
export interface AppBindings {
  /** Neon (PostgreSQL) 接続文字列。`createDb()` に渡す。 */
  DATABASE_URL: string;
  /** Better Auth のセッション署名鍵（SEC-03）。 */
  BETTER_AUTH_SECRET: string;
  /** Better Auth のベース URL（Cookie / リダイレクトの基点）。 */
  BETTER_AUTH_URL: string;
  /** R2 / S3 互換アクセスのアカウント ID。 */
  R2_ACCOUNT_ID: string;
  /** R2 アクセスキー ID。 */
  R2_ACCESS_KEY_ID: string;
  /** R2 シークレットアクセスキー。 */
  R2_SECRET_ACCESS_KEY: string;
  /** R2 バケット名。 */
  R2_BUCKET_NAME: string;
  /** 画像配信（Cloudflare Images / cdn-cgi）のベース URL。 */
  IMAGE_BASE_URL: string;
  /**
   * CORS で許可するブラウザオリジン（例 `http://localhost:3000`）。
   * ローカル dev は web(:3000) と api(:8787) が別オリジンのため設定する（SEC-03 / D2）。
   * 本番は同一オリジン（ADR D4）なので未設定でよく、未設定時は CORS ヘッダを付けない。
   */
  WEB_ORIGIN?: string;
}

/** Hono の `Bindings` として使うエイリアス。 */
export type Bindings = AppBindings;
