/**
 * B2 slug ロジック（FR-03 仮値初期化 / FR-11 公開 URL `/p/{slug}`）。
 *
 * 純ロジックのみ。DB アクセスはしない。
 * 重複チェックは呼び出し側が `isTaken` 述語として注入する（`ensureUniqueSlug`）。
 */

/** slug の最小長（FR-11 公開 URL の見栄えと衝突確率のバランス）。 */
export const SLUG_MIN_LENGTH = 3;
/** slug の最大長。 */
export const SLUG_MAX_LENGTH = 30;

/**
 * 予約語。web/api のルート先頭セグメントと衝突しうるものを禁止し、
 * `/p/{slug}` 以外の経路やパス上の特殊名と混同されないようにする。
 * 大文字小文字を問わず弾く（照合は小文字化して行う）。
 */
export const RESERVED_SLUGS: readonly string[] = [
  "api",
  "p",
  "settings",
  "login",
  "signup",
  "logout",
  "admin",
  "artworks",
  "portfolio",
  "uploads",
  "images",
  "auth",
  "_next",
  "assets",
  "static",
  "public",
  "favicon",
  "robots",
  "sitemap",
  "www",
  "root",
  "null",
  "undefined",
];

const RESERVED_SET = new Set(RESERVED_SLUGS);

/** 妥当な slug の形（小文字英数字＋単一ハイフン区切り、先頭末尾は英数字）。 */
const SLUG_PATTERN = /^[a-z0-9](?:-?[a-z0-9])*$/;

/**
 * slug が公開 URL に使える妥当な値かを判定する純関数（FR-11）。
 * - 小文字英数字とハイフンのみ、`^[a-z0-9](?:-?[a-z0-9])*$`
 * - 長さ 3〜30、先頭/末尾ハイフン不可、連続ハイフン不可
 * - 予約語（大文字小文字問わず）は false
 */
export function isValidSlug(slug: string): boolean {
  if (typeof slug !== "string") return false;
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return false;
  }
  if (RESERVED_SET.has(slug.toLowerCase())) return false;
  return SLUG_PATTERN.test(slug);
}

/**
 * 入力をベストエフォートで slug 形に正規化する（ASCII のみ採用）。
 * - 小文字化
 * - ASCII 英数字以外（空白・記号・非 ASCII）をハイフンに置換
 * - 連続ハイフンを 1 つに圧縮し、前後ハイフンを除去
 *
 * 非 ASCII のみの入力（日本語など）は空文字になり得る。
 * その場合は呼び出し側が `generateProvisionalSlug` 等にフォールバックする前提。
 * 長さの担保はしない（不正値を返さないことのみを保証）。
 */
export function normalizeSlug(input: string): string {
  if (typeof input !== "string") return "";
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * seed（例: user id）から決定的に妥当な仮 slug を生成する（FR-03）。
 * 乱数は使わず seed のみから導出するためテスト可能。
 *
 * `user-` プレフィックス + seed 由来の英数字ハッシュで、
 * 予約語・長さ・文字種すべて `isValidSlug` を満たす値を返す。
 */
export function generateProvisionalSlug(seed: string): string {
  const safeSeed = typeof seed === "string" ? seed : "";
  const token = hashToken(safeSeed);
  // `user-` プレフィックスにより予約語衝突を避けつつ識別性を持たせる。
  const slug = `user-${token}`;
  // 設計上 isValidSlug を満たすが、防御的に検証して保証する。
  return isValidSlug(slug) ? slug : `user-${hashToken(`${safeSeed}-fallback`)}`;
}

/**
 * 候補 slug を未使用かつ妥当な slug に確定する。
 * `candidate` が妥当でなければ正規化を試み、それも不可なら仮値を生成する。
 * `isTaken` が true の間 `-2`, `-3` ... と接尾辞を付けて衝突を回避する。
 * 接尾辞付与で 30 文字を超える場合は基底を切り詰めて長さを担保する。
 */
export function ensureUniqueSlug(
  candidate: string,
  isTaken: (slug: string) => boolean,
): string {
  const base = toValidBase(candidate);

  if (!isTaken(base)) return base;

  for (let suffix = 2; ; suffix++) {
    const tail = `-${suffix}`;
    const trimmed = base.slice(0, SLUG_MAX_LENGTH - tail.length);
    // 切り詰めで末尾ハイフンが残らないよう除去してから付与する。
    const withSuffix = `${trimmed.replace(/-+$/, "")}${tail}`;
    if (isValidSlug(withSuffix) && !isTaken(withSuffix)) {
      return withSuffix;
    }
  }
}

/**
 * 候補を妥当な基底 slug に落とす内部ヘルパ。
 * 正規化 → 妥当なら採用、不可なら seed として仮値生成にフォールバック。
 */
function toValidBase(candidate: string): string {
  const normalized = normalizeSlug(candidate ?? "");
  const trimmed = normalized.slice(0, SLUG_MAX_LENGTH).replace(/-+$/, "");
  if (isValidSlug(trimmed)) return trimmed;
  return generateProvisionalSlug(candidate ?? "");
}

/**
 * seed から決定的な短い英数字トークンを生成する（FNV-1a 32bit ベース）。
 * 衝突回避用ではなく識別子の体裁付与が目的。常に英数字のみを返す。
 */
function hashToken(seed: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    // FNV prime 乗算（32bit に丸める）
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // 安定した長さ（base36 7 桁程度）にパディングして返す。
  return hash.toString(36).padStart(7, "0").slice(0, 8);
}
