/**
 * C2 作品 CRUD ルート（FR-05 一覧/作成/編集/削除 / FR-07 削除 / FR-08 status /
 * FR-09 sort_order / FR-10・SEC-01 所有者一致をサーバーで検証）。
 *
 * - repo は注入（テストで in-memory モック / DB 非依存）。
 * - 全エンドポイントで `requireAuth`。作成時 `userId` はサーバーが付与し、
 *   クライアント値を一切信用しない（SEC-01）。
 * - `artist_profile_id` は当該ユーザーのプロフィールから解決する（`resolveArtistProfileId`）。
 * - 変更系（GET:id / PATCH / DELETE）は findById → 404 → assertOwner（403）→ 操作。
 *
 * バリデーションは手動（zod 等の新規依存を入れない方針）。既存ライブラリ群と
 * 揃え、Workers 上の依存を最小化する。
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { assertOwner } from "../lib/auth-guard";
import {
  type SessionVariables,
  getCurrentUser,
  requireAuth,
} from "../lib/session";
import type { ArtworkStatus } from "../lib/visibility";
import type {
  ArtworkRepository,
  CreateArtworkInput,
  UpdateArtworkPatch,
} from "../repositories/artwork-repository";
// 型のみ import（注入なので循環依存を避ける / C3 の型を再利用）。
import type { ArtworkImageRepository } from "../repositories/image-repository";

/** 削除時に R2 オブジェクトを消すための最小ストレージ契約（C3 の StorageClient 部分集合）。 */
export interface ArtworksRoutesStorage {
  deleteObject(key: string): Promise<void>;
}

/**
 * ルートの依存。`repo` は永続化、`resolveArtistProfileId` は作成時に当該ユーザーの
 * プロフィール id を解決する（プロフィール作成自体は範囲外 / C4 等）。
 * `imageRepo` / `storage` は削除時の R2 クリーンアップ（FR-07）に使う。
 */
export interface ArtworksRoutesDeps {
  repo: ArtworkRepository;
  resolveArtistProfileId: (userId: string) => Promise<string | null>;
  imageRepo: ArtworkImageRepository;
  storage: ArtworksRoutesStorage;
}

/**
 * Hono 環境。`Variables` にセッションと、リクエストごとに差し替え可能な deps を持つ。
 * deps は env(DATABASE_URL) 依存のため、本番では middleware で context に載せる。
 */
type AppEnv = {
  Variables: SessionVariables & { artworksDeps?: ArtworksRoutesDeps };
};

const VALID_STATUS: readonly ArtworkStatus[] = ["draft", "published"];

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

/** title: 非空文字列を検証して trim 済みを返す。 */
function validateTitle(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    badRequest("title is required and must be a non-empty string");
  }
  return (value as string).trim();
}

/** status: 'draft' | 'published' を検証。 */
function validateStatus(value: unknown): ArtworkStatus {
  if (!VALID_STATUS.includes(value as ArtworkStatus)) {
    badRequest("status must be 'draft' or 'published'");
  }
  return value as ArtworkStatus;
}

function validateBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") badRequest(`${field} must be a boolean`);
  return value as boolean;
}

function validateSortOrder(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    badRequest("sortOrder must be an integer");
  }
  return value as number;
}

/** description: null または文字列。 */
function validateDescription(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") badRequest("description must be a string");
  return value as string;
}

/** 作成ボディ → CreateArtworkInput（userId / artistProfileId 以外）。 */
function parseCreateBody(raw: unknown): Omit<
  CreateArtworkInput,
  "userId" | "artistProfileId"
> {
  const body = asRecord(raw);
  const input: Omit<CreateArtworkInput, "userId" | "artistProfileId"> = {
    title: validateTitle(body.title),
  };
  if (body.description !== undefined)
    input.description = validateDescription(body.description);
  if (body.status !== undefined) input.status = validateStatus(body.status);
  if (body.isPublic !== undefined)
    input.isPublic = validateBoolean(body.isPublic, "isPublic");
  if (body.sortOrder !== undefined)
    input.sortOrder = validateSortOrder(body.sortOrder);
  return input;
}

/** 更新ボディ → UpdateArtworkPatch。指定フィールドのみ検証して載せる。 */
function parseUpdateBody(raw: unknown): UpdateArtworkPatch {
  const body = asRecord(raw);
  const patch: UpdateArtworkPatch = {};
  if (body.title !== undefined) patch.title = validateTitle(body.title);
  if (body.description !== undefined)
    patch.description = validateDescription(body.description);
  if (body.status !== undefined) patch.status = validateStatus(body.status);
  if (body.isPublic !== undefined)
    patch.isPublic = validateBoolean(body.isPublic, "isPublic");
  if (body.sortOrder !== undefined)
    patch.sortOrder = validateSortOrder(body.sortOrder);
  return patch;
}

/**
 * deps を解決する。明示注入（テスト）を優先し、無ければ context（本番 middleware）から取る。
 */
function resolveDeps(
  injected: ArtworksRoutesDeps | undefined,
  c: { get: (k: "artworksDeps") => ArtworksRoutesDeps | undefined },
): ArtworksRoutesDeps {
  const deps = injected ?? c.get("artworksDeps");
  if (!deps) {
    throw new HTTPException(500, { message: "artworks deps not configured" });
  }
  return deps;
}

/**
 * 作品 CRUD ルートを生成する。
 *
 * - テスト: `createArtworksRoutes({ repo, resolveArtistProfileId })` で deps を注入。
 * - 本番: deps を省略し、env(DATABASE_URL) 依存の deps を呼び出し側の middleware で
 *   `c.set('artworksDeps', ...)` してから `app.route('/artworks', createArtworksRoutes())`。
 */
export function createArtworksRoutes(injectedDeps?: ArtworksRoutesDeps) {
  // メソッドチェーンで合成する。チェーンの戻り値を return することで
  // `ReturnType<typeof createArtworksRoutes>` に各ルートの入出力型が載り、
  // web の `hc<AppType>()` が型付きアクセスできる（NFR-11 / ADR D5）。
  return (
    new Hono<AppEnv>()
      // 全エンドポイントで認証必須。
      .use("*", requireAuth)
      // 一覧（自分のものだけ / FR-05）。
      .get("/", async (c) => {
        const { repo } = resolveDeps(injectedDeps, c);
        const user = getCurrentUser(c);
        const items = await repo.listByUser(user.id);
        return c.json(items);
      })
      // 作成（userId はサーバー付与 / SEC-01。FR-05,08,09）。
      // json 入力は `validator` で型を宣言し、web の `hc<AppType>()` に body 型を伝える
      // （NFR-11 / ADR D5）。検証ロジックは従来の parseCreateBody を validator 内で実行し、
      // 不正フィールドは 400（HTTPException）で従来どおり弾く（挙動不変）。
      .post("/", validator("json", (value) => parseCreateBody(value)), async (c) => {
        const { repo, resolveArtistProfileId } = resolveDeps(injectedDeps, c);
        const user = getCurrentUser(c);
        const parsed = c.req.valid("json");

        const artistProfileId = await resolveArtistProfileId(user.id);
        if (artistProfileId === null) {
          throw new HTTPException(400, {
            message: "Artist profile not found for current user",
          });
        }

        const created = await repo.create({
          ...parsed,
          userId: user.id,
          artistProfileId,
        });
        return c.json(created, 201);
      })
      // 単体取得（所有者検証 / FR-10）。
      .get("/:id", async (c) => {
        const { repo } = resolveDeps(injectedDeps, c);
        const user = getCurrentUser(c);
        const row = await repo.findById(c.req.param("id"));
        if (row === null) throw new HTTPException(404, { message: "Not Found" });
        assertOwner(user.id, row);
        return c.json(row);
      })
      // 更新（所有者検証 → 部分更新 / FR-08,09,10）。
      // json 入力は `validator` で型を宣言し、web に PATCH body 型を伝える（NFR-11 / ADR D5）。
      .patch("/:id", validator("json", (value) => parseUpdateBody(value)), async (c) => {
        const { repo } = resolveDeps(injectedDeps, c);
        const user = getCurrentUser(c);
        const patch = c.req.valid("json");
        const id = c.req.param("id");

        const row = await repo.findById(id);
        if (row === null) throw new HTTPException(404, { message: "Not Found" });
        assertOwner(user.id, row);

        const updated = await repo.update(id, patch);
        if (updated === null)
          throw new HTTPException(404, { message: "Not Found" });
        return c.json(updated);
      })
      // 削除（所有者検証 → R2 削除 → DB 削除 / FR-07,10）。
      // DB 行は FK cascade で消えるが R2 オブジェクトは残るため、先に R2 を消す。
      .delete("/:id", async (c) => {
        const { repo, imageRepo, storage } = resolveDeps(injectedDeps, c);
        const user = getCurrentUser(c);
        const id = c.req.param("id");

        const row = await repo.findById(id);
        if (row === null) throw new HTTPException(404, { message: "Not Found" });
        assertOwner(user.id, row);

        // 紐づく画像の R2 オブジェクトを削除（ベストエフォート）。順序は R2 → DB。
        const images = await imageRepo.listByArtwork(id);
        for (const image of images) {
          await storage.deleteObject(image.r2Key);
        }

        await repo.delete(id);
        return c.body(null, 204);
      })
  );
}
