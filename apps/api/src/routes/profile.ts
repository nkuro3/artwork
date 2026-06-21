/**
 * C7 プロフィールルート（FR-03 サインアップ初期化 / lazy init・FR-11 公開 URL slug・
 * FR-10・SEC-01 所有は自分の userId のみ）。
 *
 * - repo は注入（テストで in-memory モック / DB 非依存）。
 * - 全エンドポイントで `requireAuth`。操作対象は常に「現在ユーザーの userId」に固定し、
 *   他者のプロフィールには一切触れない（SEC-01）。
 * - `GET /profile`: プロフィールが無ければ仮 slug で lazy init して返す（FR-03 二段目）。
 * - `PATCH /profile`: displayName / slug / bio / isPublic を部分更新。slug は B2 の
 *   `isValidSlug` + `isSlugTaken`（自分を除く重複チェック）で検証する。
 *
 * バリデーションは手動（zod 等の新規依存を入れない方針）。既存ルート群と揃える。
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  type SessionVariables,
  getCurrentUser,
  requireAuth,
} from "../lib/session";
import {
  ensureUniqueSlug,
  generateProvisionalSlug,
  isValidSlug,
} from "../lib/slug";
import type {
  ArtistProfile,
  ArtistProfileRepository,
  UpdateArtistProfilePatch,
} from "../repositories/artist-profile-repository";

/** ルートの依存。`profileRepo` は永続化を担う（DB 非依存にするため注入）。 */
export interface ProfileRoutesDeps {
  profileRepo: ArtistProfileRepository;
}

/**
 * Hono 環境。`Variables` にセッションと、リクエストごとに差し替え可能な deps を持つ。
 * deps は env(DATABASE_URL) 依存のため、本番では middleware で context に載せる。
 */
type AppEnv = {
  Variables: SessionVariables & { profileDeps?: ProfileRoutesDeps };
};

/** 400 を投げる検証エラー。 */
function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

/** 不明な値を安全に object として扱う（JSON ボディの最小防御）。 */
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    badRequest("Body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

/** displayName: 非空文字列を検証して trim 済みを返す。 */
function validateDisplayName(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    badRequest("displayName must be a non-empty string");
  }
  return (value as string).trim();
}

/** bio: null または文字列。 */
function validateBio(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") badRequest("bio must be a string or null");
  return value as string;
}

/** JSON ボディを取得（不正な JSON は 400）。 */
async function readJson(c: {
  req: { json: () => Promise<unknown> };
}): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    badRequest("Invalid JSON body");
  }
}

/**
 * deps を解決する。明示注入（テスト）を優先し、無ければ context（本番 middleware）から取る。
 */
function resolveDeps(
  injected: ProfileRoutesDeps | undefined,
  c: { get: (k: "profileDeps") => ProfileRoutesDeps | undefined },
): ProfileRoutesDeps {
  const deps = injected ?? c.get("profileDeps");
  if (!deps) {
    throw new HTTPException(500, { message: "profile deps not configured" });
  }
  return deps;
}

/**
 * 現在ユーザーのプロフィールを取得し、無ければ仮 slug で作成する（FR-03 lazy init）。
 * 仮 slug（`generateProvisionalSlug(userId)`）が他者と衝突しても `ensureUniqueSlug` で一意化する。
 * GET / PATCH の双方から呼ぶことで、databaseHooks 未発火でも常にプロフィールを保証する（冪等）。
 */
async function getOrCreateProfile(
  repo: ArtistProfileRepository,
  userId: string,
): Promise<ArtistProfile> {
  const existing = await repo.getByUserId(userId);
  if (existing) return existing;

  const provisional = generateProvisionalSlug(userId);
  // isSlugTaken は非同期だが ensureUniqueSlug は同期述語を要求するため、
  // 候補が衝突する間だけ順次確認しながら一意な slug を決める。
  const slug = await resolveUniqueSlug(repo, provisional, userId);
  return repo.create({ userId, slug });
}

/**
 * 候補 slug を、（自分を除く）他者と衝突しない妥当な slug に確定する（非同期版）。
 * `ensureUniqueSlug`（同期）に「これまで衝突確認した集合」を述語として渡し、
 * 提案された slug を都度 DB で確認、衝突していれば既知集合に足して再試行する。
 */
async function resolveUniqueSlug(
  repo: ArtistProfileRepository,
  candidate: string,
  exceptUserId: string,
): Promise<string> {
  const known = new Set<string>();
  // ensureUniqueSlug は同期述語で候補を提案するので、提案ごとに非同期で確認する。
  // 確定するまで（新たな衝突が見つからなくなるまで）ループする。
  for (;;) {
    const proposed = ensureUniqueSlug(candidate, (s) => known.has(s));
    if (await repo.isSlugTaken(proposed, exceptUserId)) {
      known.add(proposed);
      continue;
    }
    return proposed;
  }
}

/**
 * PATCH ボディを検証して更新パッチを組む。
 * slug は明示指定時のみ検証し、他者使用中なら 400（仮 slug の自動一意化はしない＝ユーザー意図を尊重）。
 * isPublic は受理するがスキーマに列が無いため保持しない（DTO 互換のため受け流す）。
 */
async function parseUpdateBody(
  repo: ArtistProfileRepository,
  raw: unknown,
  userId: string,
): Promise<UpdateArtistProfilePatch> {
  const body = asRecord(raw);
  const patch: UpdateArtistProfilePatch = {};

  if (body.displayName !== undefined) {
    patch.displayName = validateDisplayName(body.displayName);
  }
  if (body.bio !== undefined) {
    patch.bio = validateBio(body.bio);
  }
  if (body.isPublic !== undefined && typeof body.isPublic !== "boolean") {
    badRequest("isPublic must be a boolean");
  }
  if (body.slug !== undefined) {
    if (typeof body.slug !== "string" || !isValidSlug(body.slug)) {
      badRequest("slug is invalid");
    }
    if (await repo.isSlugTaken(body.slug, userId)) {
      badRequest("slug is already taken");
    }
    patch.slug = body.slug;
  }

  return patch;
}

/**
 * プロフィールルートを生成する。
 *
 * - テスト: `createProfileRoutes({ profileRepo })` で deps を注入。
 * - 本番: deps を省略し、env(DATABASE_URL) 依存の deps を呼び出し側の middleware で
 *   `c.set('profileDeps', ...)` してから `app.route('/profile', createProfileRoutes())`。
 */
export function createProfileRoutes(injectedDeps?: ProfileRoutesDeps) {
  const app = new Hono<AppEnv>();

  // 全エンドポイントで認証必須。
  app.use("*", requireAuth);

  // 現在ユーザーのプロフィール。無ければ lazy init（FR-03）。
  app.get("/", async (c) => {
    const { profileRepo } = resolveDeps(injectedDeps, c);
    const user = getCurrentUser(c);
    const profile = await getOrCreateProfile(profileRepo, user.id);
    return c.json(profile);
  });

  // 部分更新（displayName / slug / bio / isPublic）。所有は現在ユーザーの userId のみ。
  app.patch("/", async (c) => {
    const { profileRepo } = resolveDeps(injectedDeps, c);
    const user = getCurrentUser(c);
    const patch = await parseUpdateBody(profileRepo, await readJson(c), user.id);

    // 未作成でも更新できるよう lazy init を保証してから更新する（FR-03 / 冪等）。
    await getOrCreateProfile(profileRepo, user.id);

    const updated = await profileRepo.updateByUserId(user.id, patch);
    if (updated === null) {
      // getOrCreateProfile 直後なので通常起き得ないが、防御的に 404。
      throw new HTTPException(404, { message: "Profile not found" });
    }
    return c.json(updated);
  });

  return app;
}
