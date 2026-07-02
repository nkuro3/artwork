// Worker の env（.dev.vars / wrangler.toml [vars] / シークレット）の型。
export type AppBindings = {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  /** ローカルのみ設定（別オリジンの web から CORS で叩くため）。本番は同一オリジンで未設定。 */
  WEB_ORIGIN?: string;
  // R2 (S3 API)。dev は artwork-images-dev バケット（.dev.vars）。
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
};
