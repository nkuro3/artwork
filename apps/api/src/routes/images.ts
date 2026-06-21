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
import { assertOwner } from "../lib/auth-guard";
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
  const app = new Hono<AppEnv>();

  // 全エンドポイントで認証必須。
  app.use("*", requireAuth);

  // 署名 URL 発行（NFR-02 / SEC-06 / ADR D9）。推測不能キーを採番し、
  // presigned PUT URL とそのキーを返す。アップロードはブラウザが R2 へ直接行う。
  app.post("/uploads/sign", async (c) => {
    const deps = resolveDeps(injectedDeps, c);
    getCurrentUser(c); // 認証済みであることのみ要求。
    const body = asRecord(await readJson(c));

    const ext = validateNonEmptyString(body.ext, "ext");
    let contentType: string | undefined;
    if (body.contentType !== undefined) {
      contentType = validateNonEmptyString(body.contentType, "contentType");
    }

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
  });

  // 画像メタ作成（FR-06）。所有者の artwork に紐づけ、sortOrder を連番付与（B3）。
  app.post("/artworks/:id/images", async (c) => {
    const deps = resolveDeps(injectedDeps, c);
    const user = getCurrentUser(c);
    const artworkId = c.req.param("id");
    const body = asRecord(await readJson(c));

    const artwork = await deps.artworkRepo.findById(artworkId);
    if (artwork === null) {
      throw new HTTPException(404, { message: "Not Found" });
    }
    assertOwner(user.id, artwork);

    const r2Key = validateNonEmptyString(body.r2Key, "r2Key");
    const width = validateOptionalDimension(body.width, "width");
    const height = validateOptionalDimension(body.height, "height");

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
  });

  // 画像削除（FR-07）。所有者検証 → R2 オブジェクト削除 → DB 行削除。
  app.delete("/images/:id", async (c) => {
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
  });

  // 並び替え（FR-06）。所有 artwork の画像のみを対象に、B3 で差分を算出して反映。
  app.patch("/artworks/:id/images/order", async (c) => {
    const deps = resolveDeps(injectedDeps, c);
    const user = getCurrentUser(c);
    const artworkId = c.req.param("id");
    const body = asRecord(await readJson(c));

    const artwork = await deps.artworkRepo.findById(artworkId);
    if (artwork === null) {
      throw new HTTPException(404, { message: "Not Found" });
    }
    assertOwner(user.id, artwork);

    const orderedIds = parseOrderedIds(body.orderedIds);

    // 当該 artwork に属する画像のみ有効（所有外/別 artwork の id は弾く / SEC-01）。
    const images = await deps.imageRepo.listByArtwork(artworkId);
    const byId = new Map<string, ArtworkImage>(images.map((i) => [i.id, i]));

    // リクエスト順から有効な画像だけを残して新しい並びを作る。
    const orderedItems = orderedIds
      .map((id) => byId.get(id))
      .filter((img): img is ArtworkImage => img !== undefined);

    // B3: 並びに沿った 0..n の連番を割り当て、変化分のみを抽出する。
    const normalized = normalizeSortOrders(orderedItems);
    const diff = normalized.filter((u) => byId.get(u.id)?.sortOrder !== u.sortOrder);

    await deps.imageRepo.updateSortOrders(diff);

    return c.json({ updated: diff.length });
  });

  return app;
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
