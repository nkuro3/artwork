/**
 * B6 R2 ストレージ抽象（NFR-02 ブラウザ→R2 直 / SEC-06 短命・スコープ限定 presigned URL / ADR D10）。
 *
 * R2 とのやり取りはこのモジュールに隔離する（apps/api/CLAUDE.md）。
 * 設定（鍵・バケット）は呼び出し側から注入し、env を直接読まない（依存注入）。
 */

import { AwsClient } from "aws4fetch";

/** R2（S3 互換）への接続情報。env から組み立てて注入する。 */
export interface StorageConfig {
  /** Cloudflare アカウント ID（R2 S3 エンドポイントのホストに使う）。 */
  accountId: string;
  /** R2 アクセスキー ID。 */
  accessKeyId: string;
  /** R2 シークレットアクセスキー。 */
  secretAccessKey: string;
  /** 対象バケット名。 */
  bucketName: string;
}

/** presigned PUT URL 生成のオプション。 */
export interface PresignPutOptions {
  /** 有効期限（秒）。SEC-06 のため短命を既定とする。 */
  expiresIn?: number;
  /** 署名に含める Content-Type（指定時はアップロード時に一致が要求される）。 */
  contentType?: string;
}

/** presigned PUT URL の既定有効期限（秒）。SEC-06 短命方針。 */
export const DEFAULT_PUT_EXPIRES_IN = 300;

/** R2 ストレージクライアント。 */
export interface StorageClient {
  /** 署名なしの S3 オブジェクト URL（内部利用）。 */
  objectEndpoint(key: string): string;
  /** ブラウザ直アップロード用の presigned PUT URL を生成する。 */
  presignPutUrl(key: string, opts?: PresignPutOptions): Promise<string>;
}

/** 先頭スラッシュを除去してキーを正規化する。 */
function normalizeKey(key: string): string {
  return key.replace(/^\/+/, "");
}

/**
 * R2 ストレージクライアントを生成する（依存注入）。
 * aws4fetch の `AwsClient`（region:"auto", service:"s3"）で SigV4 を扱う。
 */
export function createStorageClient(config: StorageConfig): StorageClient {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: "auto",
    service: "s3",
  });

  const host = `${config.accountId}.r2.cloudflarestorage.com`;

  function objectEndpoint(key: string): string {
    return `https://${host}/${config.bucketName}/${normalizeKey(key)}`;
  }

  async function presignPutUrl(
    key: string,
    opts?: PresignPutOptions,
  ): Promise<string> {
    const expiresIn = opts?.expiresIn ?? DEFAULT_PUT_EXPIRES_IN;

    // X-Amz-Expires は署名対象 URL のクエリに載せる。
    const url = new URL(objectEndpoint(key));
    url.searchParams.set("X-Amz-Expires", String(expiresIn));

    // exactOptionalPropertyTypes 対応：contentType がある時だけ headers を付ける。
    // signQuery 時、aws4fetch は既定で host のみを署名する。content-type を
    // X-Amz-SignedHeaders に含めて拘束するため allHeaders を有効にする。
    const init: RequestInit & {
      aws: { signQuery: true; allHeaders?: boolean };
    } = {
      method: "PUT",
      aws: { signQuery: true },
    };
    if (opts?.contentType !== undefined) {
      init.headers = { "content-type": opts.contentType };
      init.aws.allHeaders = true;
    }

    const signed = await client.sign(url.toString(), init);
    return signed.url;
  }

  return { objectEndpoint, presignPutUrl };
}

/** R2 キー組み立てのオプション。 */
export interface GenerateR2KeyOptions {
  /** キーの先頭パスセグメント（例 "artworks"）。 */
  prefix?: string;
  /** 拡張子（先頭ドット有無・大小は正規化する）。 */
  ext?: string;
  /** 推測不能な乱数 ID。呼び出し側が注入する（実コードは crypto.randomUUID()）。 */
  randomId: string;
}

/**
 * 推測不能な R2 キーを組み立てる（ADR D9 公開バケット対策）。
 *
 * - `prefix` 指定時は `<prefix>/<randomId>` 形式。先頭スラッシュは作らない。
 * - `ext` は先頭ドット除去 + 小文字化して `.<ext>` として付ける。
 */
export function generateR2Key(opts: GenerateR2KeyOptions): string {
  const prefix = opts.prefix?.replace(/^\/+/, "").replace(/\/+$/, "");
  const base = prefix ? `${prefix}/${opts.randomId}` : opts.randomId;

  if (opts.ext === undefined) return base;
  const ext = opts.ext.replace(/^\.+/, "").toLowerCase();
  return ext ? `${base}.${ext}` : base;
}
