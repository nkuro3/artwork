/**
 * C3 画像ルート（FR-06 アップロード/複数/並び替え / FR-07 削除時に R2 も削除 /
 * NFR-02 署名 URL でブラウザ→R2 直 PUT / SEC-06 短命 URL / ADR D9・D10）。
 *
 * - deps は注入（テストで in-memory モック repo + モック storage / DB・R2 非依存）。
 * - 全エンドポイントで `requireAuth`。`userId` はサーバーが付与し、クライアント値は
 *   一切信用しない（SEC-01）。
 * - 変更系は artwork/画像を findById → 404 → assertOwner（403）→ 操作。
 *
 * バリデーションは手動（zod 等の新規依存を入れない方針。C2 と揃える）。
 *
 * ルート構成（NFR-11 草案）:
 *   POST   /uploads/sign              署名 URL 発行（B6）
 *   POST   /artworks/:id/images       画像メタ作成（B3 nextSortOrder）
 *   DELETE /images/:id                画像削除（R2 + DB / FR-07）
 *   PATCH  /artworks/:id/images/order 並び替え（B3 normalizeSortOrders 差分）
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { assertOwner } from "../lib/auth-guard";
import { thumbnailUrl } from "../lib/image/url";
import {
  type SessionVariables,
  getCurrentUser,
  requireAuth,
} from "../lib/session";
import { normalizeSortOrders, nextSortOrder } from "../lib/sort-order";
import type { StorageClient } from "../lib/storage";
import { generateR2Key } from "../lib/storage";
import type { ArtworkRepository } from "../repositories/artwork-repository";
import type {
  ArtworkImage,
  ArtworkImageRepository,
} from "../repositories/image-repository";

/**
 * 画像ルートの依存。`generateId` は推測不能な R2 キー用の乱数 ID（ADR D9）。
 * 既定は `crypto.randomUUID`。テストでは決定的な採番を注入する。
 */
export interface ImageRoutesDeps {
  imageRepo: ArtworkImageRepository;
  artworkRepo: ArtworkRepository;
  storage: StorageClient;
  generateId?: () => string;
  /** 画像配信のベース URL（env `IMAGE_BASE_URL`）。一覧の thumbnailUrl 組み立て（B5）に使う。 */
  imageBaseUrl: string;
}

/** 編集画面（02 §6.7）向けの画像一覧 DTO。内部スキーマ生値（r2Key 等）は出さない（ADR D5）。 */
export interface ArtworkImageDto {
  id: string;
  thumbnailUrl: string;
  sortOrder: number;
}

type AppEnv = {
  Variables: SessionVariables & { imageDeps?: ImageRoutesDeps };
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

/** 非空文字列を検証する。 */
function validateNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    badRequest(`${field} is required and must be a non-empty string`);
  }
  return (value as string).trim();
}

/** 任意の正整数（width/height）。未指定は undefined。 */
function validateOptionalDimension(
  value: unknown,
  field: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    badRequest(`${field} must be a positive integer`);
  }
  return value as number;
}

/** 署名 URL 発行ボディ → 型付き入力。 */
function parseSignBody(raw: unknown): { ext: string; contentType?: string } {
  const body = asRecord(raw);
  const ext = validateNonEmptyString(body.ext, "ext");
  if (body.contentType !== undefined) {
    return {
      ext,
      contentType: validateNonEmptyString(body.contentType, "contentType"),
    };
  }
  return { ext };
}

/** 画像メタ作成ボディ → 型付き入力。 */
function parseImageMetaBody(raw: unknown): {
  r2Key: string;
  width?: number;
  height?: number;
} {
  const body = asRecord(raw);
  const r2Key = validateNonEmptyString(body.r2Key, "r2Key");
  const width = validateOptionalDimension(body.width, "width");
  const height = validateOptionalDimension(body.height, "height");
  return {
    r2Key,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

/** 並び替えボディ → 型付き入力。 */
function parseOrderBody(raw: unknown): { orderedIds: string[] } {
  const body = asRecord(raw);
  return { orderedIds: parseOrderedIds(body.orderedIds) };
}

/**
 * deps を解決する。明示注入（テスト）を優先し、無ければ context（本番 middleware）から取る。
 */
function resolveDeps(
  injected: ImageRoutesDeps | undefined,
  c: { get: (k: "imageDeps") => ImageRoutesDeps | undefined },
): ImageRoutesDeps {
  const deps = injected ?? c.get("imageDeps");
  if (!deps) {
    throw new HTTPException(500, { message: "image deps not configured" });
  }
  return deps;
}

/**
 * 画像ルートを生成する。
 *
 * - テスト: `createImageRoutes({ imageRepo, artworkRepo, storage, generateId })` で注入。
 * - 本番: deps を省略し、env(DATABASE_URL / R2 鍵) 依存の deps を呼び出し側の
 *   middleware で `c.set('imageDeps', ...)` してから `app.route('/', createImageRoutes())`。
 */
export function createImageRoutes(injectedDeps?: ImageRoutesDeps) {
  // メソッドチェーンで合成する。チェーンの戻り値を return することで
  // `ReturnType<typeof createImageRoutes>` に各ルートの入出力型が載り、
  // web の `hc<AppType>()` が型付きアクセスできる（NFR-11 / ADR D5）。
  return (
    new Hono<AppEnv>()
      // 全エンドポイントで認証必須。
      .use("*", requireAuth)
      // 自作品の画像一覧（B4b / 02 §6.7 編集プリフィル）。所有者検証 → sort_order 昇順で
      // DTO 整形。下書き/非公開でも所有者なら取得可。r2Key 等の生値は出さない（ADR D5）。
      .get("/artworks/:id/images", async (c) => {
        const deps = resolveDeps(injectedDeps, c);
        const user = getCurrentUser(c);
        const artworkId = c.req.param("id");

        const artwork = await deps.artworkRepo.findById(artworkId);
        if (artwork === null) {
          throw new HTTPException(404, { message: "Not Found" });
        }
        assertOwner(user.id, artwork);

        // listByArtwork は sort_order 昇順を返す契約だが、ここでも明示的に昇順を保証する。
        const images = [...(await deps.imageRepo.listByArtwork(artworkId))].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );
        const body: ArtworkImageDto[] = images.map((img) => ({
          id: img.id,
          thumbnailUrl: thumbnailUrl(deps.imageBaseUrl, img.r2Key),
          sortOrder: img.sortOrder,
        }));
        return c.json(body);
      })
      // 署名 URL 発行（NFR-02 / SEC-06 / ADR D9）。推測不能キーを採番し、
      // presigned PUT URL とそのキーを返す。アップロードはブラウザが R2 へ直接行う。
      .post(
        "/uploads/sign",
        validator("json", (value) => parseSignBody(value)),
        async (c) => {
        const deps = resolveDeps(injectedDeps, c);
        getCurrentUser(c); // 認証済みであることのみ要求。
        const { ext, contentType } = c.req.valid("json");

        const generateId = deps.generateId ?? (() => crypto.randomUUID());
        const r2Key = generateR2Key({
          prefix: "artworks",
          ext,
          randomId: generateId(),
        });

        const uploadUrl = await deps.storage.presignPutUrl(
          r2Key,
          contentType !== undefined ? { contentType } : undefined,
        );

        return c.json({ uploadUrl, r2Key }, 201);
      })
      // 画像メタ作成（FR-06）。所有者の artwork に紐づけ、sortOrder を連番付与（B3）。
      // json 入力は `validator` で型を宣言し、web に body 型を伝える（NFR-11 / ADR D5）。
      .post(
        "/artworks/:id/images",
        validator("json", (value) => parseImageMetaBody(value)),
        async (c) => {
        const deps = resolveDeps(injectedDeps, c);
        const user = getCurrentUser(c);
        const artworkId = c.req.param("id");
        const { r2Key, width, height } = c.req.valid("json");

        const artwork = await deps.artworkRepo.findById(artworkId);
        if (artwork === null) {
          throw new HTTPException(404, { message: "Not Found" });
        }
        assertOwner(user.id, artwork);

        const existing = await deps.imageRepo.listByArtwork(artworkId);
        const created = await deps.imageRepo.create({
          artworkId,
          userId: user.id, // サーバー付与（SEC-01）。
          r2Key,
          ...(width !== undefined ? { width } : {}),
          ...(height !== undefined ? { height } : {}),
          sortOrder: nextSortOrder(existing),
        });

        return c.json(created, 201);
      })
      // 画像削除（FR-07）。所有者検証 → R2 オブジェクト削除 → DB 行削除。
      .delete("/images/:id", async (c) => {
        const deps = resolveDeps(injectedDeps, c);
        const user = getCurrentUser(c);
        const id = c.req.param("id");

        const image = await deps.imageRepo.findById(id);
        if (image === null) {
          throw new HTTPException(404, { message: "Not Found" });
        }
        assertOwner(user.id, image);

        // R2 を先に消す。R2 削除が失敗したら DB 行は残し、再試行可能にする（FR-07）。
        await deps.storage.deleteObject(image.r2Key);
        await deps.imageRepo.delete(id);

        return c.body(null, 204);
      })
      // 並び替え（FR-06）。所有 artwork の画像のみを対象に、B3 で差分を算出して反映。
      // json 入力は `validator` で型を宣言し、web に body 型を伝える（NFR-11 / ADR D5）。
      .patch(
        "/artworks/:id/images/order",
        validator("json", (value) => parseOrderBody(value)),
        async (c) => {
        const deps = resolveDeps(injectedDeps, c);
        const user = getCurrentUser(c);
        const artworkId = c.req.param("id");
        const { orderedIds } = c.req.valid("json");

        const artwork = await deps.artworkRepo.findById(artworkId);
        if (artwork === null) {
          throw new HTTPException(404, { message: "Not Found" });
        }
        assertOwner(user.id, artwork);

        // 当該 artwork に属する画像のみ有効（所有外/別 artwork の id は弾く / SEC-01）。
        const images = await deps.imageRepo.listByArtwork(artworkId);
        const byId = new Map<string, ArtworkImage>(images.map((i) => [i.id, i]));

        // リクエスト順から有効な画像だけを残して新しい並びを作る。
        const orderedItems = orderedIds
          .map((id) => byId.get(id))
          .filter((img): img is ArtworkImage => img !== undefined);

        // B3: 並びに沿った 0..n の連番を割り当て、変化分のみを抽出する。
        const normalized = normalizeSortOrders(orderedItems);
        const diff = normalized.filter(
          (u) => byId.get(u.id)?.sortOrder !== u.sortOrder,
        );

        await deps.imageRepo.updateSortOrders(diff);

        return c.json({ updated: diff.length });
      })
  );
}

/** orderedIds: 文字列配列を検証する。 */
function parseOrderedIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    badRequest("orderedIds must be an array of strings");
  }
  const arr = value as unknown[];
  for (const v of arr) {
    if (typeof v !== "string") {
      badRequest("orderedIds must be an array of strings");
    }
  }
  return arr as string[];
}
