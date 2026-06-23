/**
 * ポートフォリオ編集ルート（§6.12 `/portfolio/edit` の API / 要ログイン / FR-12,13 /
 * ADR D12 / SEC-01）。
 *
 * - 認証必須（`requireAuth`）。所有者（user_id）のみが自分のポートフォリオを編集する。
 * - 公開（status='published'）の自作品からのみ掲載できる。掲載集合と順序を
 *   portfolio_item に置換保存する（1人1ポートフォリオ）。
 * - 静的セグメント `/mine` を持つ。公開 `GET /api/portfolio/:slug`（portfolio.ts）より
 *   **先に**マウントすることで `:slug` との衝突を避ける（index.ts の登録順で担保）。
 * - 内部キー（r2Key）は web に漏らさず（ADR D5）、サムネ URL に変換して返す。
 *
 * バリデーションは手動（zod 等の新規依存を入れない方針 / 既存ルートと統一）。
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { thumbnailUrl } from "../lib/image/url";
import {
  type SessionVariables,
  getCurrentUser,
  requireAuth,
} from "../lib/session";
import type {
  PortfolioEditableArtwork,
  PortfolioItemRepository,
} from "../repositories/portfolio-item-repository";

/** ポートフォリオ編集ルートの依存。テストでモック repo を注入する。 */
export interface PortfolioMineRoutesDeps {
  portfolioItemRepo: PortfolioItemRepository;
  /** 先頭画像サムネ URL 組み立て（B5）に使う画像配信ベース URL（env `IMAGE_BASE_URL`）。 */
  imageBaseUrl: string;
}

type AppEnv = {
  Variables: SessionVariables & { portfolioMineDeps?: PortfolioMineRoutesDeps };
};

/** 公開する編集用作品 DTO（内部キーを漏らさず thumbnailUrl 化 / ADR D5）。 */
interface EditableArtworkDto {
  id: string;
  title: string;
  inPortfolio: boolean;
  position: number | null;
  thumbnailUrl: string | null;
}

/** 400 を投げる検証エラー。 */
function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

/** body `{ artworkIds: string[] }` を検証する。重複・非配列・非文字列は 400。 */
function parsePutBody(raw: unknown): { artworkIds: string[] } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    badRequest("Body must be a JSON object");
  }
  const value = (raw as Record<string, unknown>).artworkIds;
  if (!Array.isArray(value)) {
    badRequest("artworkIds must be an array");
  }
  const ids = value as unknown[];
  if (!ids.every((id) => typeof id === "string")) {
    badRequest("artworkIds must be an array of strings");
  }
  const strIds = ids as string[];
  if (new Set(strIds).size !== strIds.length) {
    badRequest("artworkIds must not contain duplicates");
  }
  return { artworkIds: strIds };
}

/** 編集用作品行 → 公開 DTO（thumbnailUrl 化 / ADR D5）。 */
function toEditableDto(
  items: readonly PortfolioEditableArtwork[],
  imageBaseUrl: string,
): EditableArtworkDto[] {
  return items.map((a) => ({
    id: a.id,
    title: a.title,
    inPortfolio: a.inPortfolio,
    position: a.position,
    thumbnailUrl: a.thumbnailR2Key
      ? thumbnailUrl(imageBaseUrl, a.thumbnailR2Key)
      : null,
  }));
}

/**
 * deps を解決する。明示注入（テスト）を優先し、無ければ context（本番 middleware）から取る。
 */
function resolveDeps(
  injected: PortfolioMineRoutesDeps | undefined,
  c: { get: (k: "portfolioMineDeps") => PortfolioMineRoutesDeps | undefined },
): PortfolioMineRoutesDeps {
  const deps = injected ?? c.get("portfolioMineDeps");
  if (!deps) {
    throw new HTTPException(500, {
      message: "portfolio mine deps not configured",
    });
  }
  return deps;
}

/**
 * ポートフォリオ編集ルートを生成する。`/mine` を持ち、公開ルートより先にマウントする。
 *
 * - テスト: `createPortfolioMineRoutes({ portfolioItemRepo, imageBaseUrl })` で注入。
 * - 本番: deps を省略し、env(DATABASE_URL) 依存の deps を middleware で
 *   `c.set('portfolioMineDeps', ...)` してから mount する。
 */
export function createPortfolioMineRoutes(
  injectedDeps?: PortfolioMineRoutesDeps,
) {
  return (
    new Hono<AppEnv>()
      .use("/mine", requireAuth)
      // 自分の公開作品（掲載有無・順序付き / §6.12）。
      .get("/mine", async (c) => {
        const { portfolioItemRepo, imageBaseUrl } = resolveDeps(injectedDeps, c);
        const user = getCurrentUser(c);
        const items = await portfolioItemRepo.listPublishedForUser(user.id);
        return c.json(toEditableDto(items, imageBaseUrl));
      })
      // 掲載集合＋順序を置換（§6.12 / FR-12,13）。
      // 所有者検証＋各 id が「自分の published 作品」であることを検証してから置換する。
      .put(
        "/mine",
        validator("json", (value) => parsePutBody(value)),
        async (c) => {
          const { portfolioItemRepo, imageBaseUrl } = resolveDeps(
            injectedDeps,
            c,
          );
          const user = getCurrentUser(c);
          const { artworkIds } = c.req.valid("json");

          // 当該ユーザーの公開作品集合を真実として、リクエスト id を検証する
          // （非所有 / 非 published を弾く / SEC-01）。
          const editable = await portfolioItemRepo.listPublishedForUser(
            user.id,
          );
          const allowed = new Set(editable.map((a) => a.id));
          if (!artworkIds.every((id) => allowed.has(id))) {
            throw new HTTPException(400, {
              message:
                "artworkIds must reference your own published artworks",
            });
          }

          await portfolioItemRepo.replaceForUser(user.id, artworkIds);

          // 置換後の最新状態を返す。
          const next = await portfolioItemRepo.listPublishedForUser(user.id);
          return c.json(toEditableDto(next, imageBaseUrl));
        },
      )
  );
}
