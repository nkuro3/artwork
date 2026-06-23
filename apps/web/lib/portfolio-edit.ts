// §6.12 ポートフォリオ編集コア（FR-12,13 / ADR D12）。
// 認証付き `GET/PUT /api/portfolio/mine` を呼んで結果を正規化する純ロジック。
// next 非依存・ユニットテスト対象（ページ/クライアントは薄いラッパで非対象 → /verify）。
// web は DB に触れず、必ず api 経由（ADR D7）。

import type { ApiClient } from "./api";

/** 編集用作品（api `GET /portfolio/mine` の公開 DTO に対応）。published 作品のみ。 */
export interface EditableArtwork {
  id: string;
  title: string;
  /** 現在ポートフォリオに掲載されているか。 */
  inPortfolio: boolean;
  /** 掲載順（未掲載なら null）。 */
  position: number | null;
  /** 先頭画像サムネ URL（画像なしは null）。 */
  thumbnailUrl: string | null;
}

// `AppType` に /portfolio/mine のルート型が載っているので、コアは型付き RPC クライアント
// （`ApiClient`）をそのまま受け取る（NFR-11 / ADR D5）。
export type PortfolioMineClient = ApiClient;

/** 正規化済みの結果。成功は data、失敗は人間可読な error。 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}
function fail<T>(error: string): Result<T> {
  return { ok: false, error };
}

/** 非 ok レスポンスからエラーメッセージを取り出す（{message} を優先）。 */
async function errorFrom(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown } | null;
    if (body && typeof body.message === "string" && body.message) {
      return body.message;
    }
  } catch {
    // ボディ無し/非 JSON は無視。
  }
  return `Request failed (${res.status})`;
}

/**
 * 表示中の作品リストと「掲載」選択集合から、掲載チェック済みを表示順に並べた
 * artworkIds を組む（§6.12 / 純関数）。order は表示順の id 配列（↑↓ で並び替え済み）。
 * order に無い id は無視する（防御）。
 */
export function selectedArtworkIds(
  _list: readonly EditableArtwork[],
  order: readonly string[],
  checked: ReadonlySet<string>,
): string[] {
  return order.filter((id) => checked.has(id));
}

/** 自分の published 作品（掲載状態/順序付き）を取得する（§6.12）。 */
export async function getPortfolioMine(
  client: PortfolioMineClient,
): Promise<Result<EditableArtwork[]>> {
  try {
    const res = await client.api.portfolio.mine.$get();
    if (!res.ok) return fail(await errorFrom(res));
    return ok((await res.json()) as EditableArtwork[]);
  } catch (e) {
    return fail(messageOf(e));
  }
}

/** 掲載集合＋順序を置換保存する（§6.12 / FR-12,13）。 */
export async function putPortfolioMine(
  client: PortfolioMineClient,
  artworkIds: string[],
): Promise<Result<EditableArtwork[]>> {
  try {
    const res = await client.api.portfolio.mine.$put({ json: { artworkIds } });
    if (!res.ok) return fail(await errorFrom(res));
    return ok((await res.json()) as EditableArtwork[]);
  } catch (e) {
    return fail(messageOf(e));
  }
}

function messageOf(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "通信に失敗しました";
}
