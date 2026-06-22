/**
 * B5 画像 URL 生成（FR-15 用途別の幅出し分け / NFR-03 R2→Image Resizing オンザフライ変換 / NFR-07 用途別サイズ）。
 *
 * 純ロジックのみ。env / DB は読まず、配信オリジン（`IMAGE_BASE_URL`）は呼び出し側が `baseUrl` 引数で渡す（ADR D9）。
 * 生成形: `<baseUrl>/cdn-cgi/image/<options>/<r2Key>`
 */

/** Cloudflare Image Resizing の変換オプション（指定したものだけ URL に出力する）。 */
export interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: "auto" | "webp" | "avif" | "json";
  fit?: "scale-down" | "contain" | "cover";
}

/** 用途別の既定幅（NFR-07）。リテラル散在を防ぐため定数で一元管理する。 */
export const IMAGE_WIDTHS = {
  /** 一覧サムネイル幅。 */
  thumbnail: 400,
  /** 作品詳細の大サイズ幅。 */
  large: 1600,
} as const;

/**
 * `cdn-cgi/image` のオプション文字列を組み立てる。
 * 指定（`undefined` でない）キーだけを定義順にカンマ連結する。
 */
function serializeOptions(options: ImageTransformOptions): string {
  const parts: string[] = [];
  if (options.width !== undefined) parts.push(`width=${options.width}`);
  if (options.height !== undefined) parts.push(`height=${options.height}`);
  if (options.quality !== undefined) parts.push(`quality=${options.quality}`);
  if (options.format !== undefined) parts.push(`format=${options.format}`);
  if (options.fit !== undefined) parts.push(`fit=${options.fit}`);
  return parts.join(",");
}

/**
 * 配信 URL を生成する（ADR D9）。
 *
 * - `baseUrl` 末尾のスラッシュと `r2Key` 先頭のスラッシュを正規化し、二重スラッシュを防ぐ。
 * - オプションは指定されたものだけを出力する（未指定キーは出さない）。
 */
export function buildImageUrl(
  baseUrl: string,
  r2Key: string,
  options: ImageTransformOptions,
): string {
  const base = baseUrl.replace(/\/+$/, "");
  const key = r2Key.replace(/^\/+/, "");
  const opts = serializeOptions(options);
  return `${base}/cdn-cgi/image/${opts}/${key}`;
}

/** 一覧サムネイル用 URL（FR-15）。幅 `IMAGE_WIDTHS.thumbnail`、format=auto。 */
export function thumbnailUrl(baseUrl: string, r2Key: string): string {
  return buildImageUrl(baseUrl, r2Key, {
    width: IMAGE_WIDTHS.thumbnail,
    format: "auto",
  });
}

/** 作品詳細の大サイズ用 URL（FR-15）。幅 `IMAGE_WIDTHS.large`、format=auto。 */
export function largeUrl(baseUrl: string, r2Key: string): string {
  return buildImageUrl(baseUrl, r2Key, {
    width: IMAGE_WIDTHS.large,
    format: "auto",
  });
}
