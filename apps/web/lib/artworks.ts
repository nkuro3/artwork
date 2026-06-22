// D3 作品管理コア（FR-05 一覧/作成/編集/削除）。
// api クライアント（D1 の `createApiClient`）を注入し、Hono RPC を呼んで結果を
// 成功/失敗に正規化する。next 非依存・純ロジックなのでユニットテスト対象（Server
// Action / 画面は薄いラッパで非対象）。web は DB に触れず、必ず api 経由（ADR D7）。

import type { ApiClient } from "./api";

/** 作品の API 表現（RPC レスポンスを web で扱う最小集合）。日付は JSON 上 string。 */
export interface Artwork {
  id: string;
  userId: string;
  artistProfileId: string;
  title: string;
  description: string | null;
  status: "draft" | "published";
  isPublic: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// C5b: `AppType` に /artworks のルート型が載ったので、コアは型付き RPC クライアント
// （`ApiClient` = `hc<AppType>()`）をそのまま受け取る。以前の構造的部分集合インターフェース
// は cast 前提で型安全でなかったため廃止し、hc 由来の精密な型に揃えた（NFR-11 / ADR D5）。
export type ArtworksClient = ApiClient;

/** 作成入力（userId/artistProfileId はサーバー付与なので含めない / SEC-01）。 */
export interface CreateArtworkInput {
  title: string;
  description?: string | null;
  status?: "draft" | "published";
  isPublic?: boolean;
  sortOrder?: number;
}

/** 更新パッチ（部分更新）。 */
export interface UpdateArtworkPatch {
  title?: string;
  description?: string | null;
  status?: "draft" | "published";
  isPublic?: boolean;
  sortOrder?: number;
}

/** 正規化済みの結果。成功は data、失敗は人間可読な error。 */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

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

/** title を検証（非空）。妥当ならトリム済みを返し、不正なら null。 */
function normalizeTitle(title: string): string | null {
  const trimmed = title.trim();
  return trimmed === "" ? null : trimmed;
}

/** 自分の作品一覧を取得する（FR-05）。 */
export async function listArtworks(
  client: ArtworksClient,
): Promise<Result<Artwork[]>> {
  try {
    const res = await client.api.artworks.$get();
    if (!res.ok) return fail(await errorFrom(res));
    const data = (await res.json()) as Artwork[];
    return ok(data);
  } catch (e) {
    return fail(messageOf(e));
  }
}

/** 作品を 1 件取得する（FR-05 編集時の現在値取得 / 所有者検証は api 側）。 */
export async function getArtwork(
  client: ArtworksClient,
  id: string,
): Promise<Result<Artwork>> {
  try {
    const res = await client.api.artworks[":id"].$get({ param: { id } });
    if (!res.ok) return fail(await errorFrom(res));
    return ok((await res.json()) as Artwork);
  } catch (e) {
    return fail(messageOf(e));
  }
}

/** 作品を作成する（FR-05）。title 非空を最小バリデーション。 */
export async function createArtwork(
  client: ArtworksClient,
  input: CreateArtworkInput,
): Promise<Result<Artwork>> {
  const title = normalizeTitle(input.title);
  if (title === null) return fail("title is required");

  const json: CreateArtworkInput = { title };
  if (input.description !== undefined) json.description = input.description;
  if (input.status !== undefined) json.status = input.status;
  if (input.isPublic !== undefined) json.isPublic = input.isPublic;
  if (input.sortOrder !== undefined) json.sortOrder = input.sortOrder;

  try {
    const res = await client.api.artworks.$post({ json });
    if (!res.ok) return fail(await errorFrom(res));
    return ok((await res.json()) as Artwork);
  } catch (e) {
    return fail(messageOf(e));
  }
}

/** 作品を部分更新する（FR-05 / FR-08）。title を指定する場合のみ非空検証。 */
export async function updateArtwork(
  client: ArtworksClient,
  id: string,
  patch: UpdateArtworkPatch,
): Promise<Result<Artwork>> {
  const json: UpdateArtworkPatch = {};
  if (patch.title !== undefined) {
    const title = normalizeTitle(patch.title);
    if (title === null) return fail("title must not be empty");
    json.title = title;
  }
  if (patch.description !== undefined) json.description = patch.description;
  if (patch.status !== undefined) json.status = patch.status;
  if (patch.isPublic !== undefined) json.isPublic = patch.isPublic;
  if (patch.sortOrder !== undefined) json.sortOrder = patch.sortOrder;

  try {
    const res = await client.api.artworks[":id"].$patch({ param: { id }, json });
    if (!res.ok) return fail(await errorFrom(res));
    return ok((await res.json()) as Artwork);
  } catch (e) {
    return fail(messageOf(e));
  }
}

/** 作品を削除する（FR-05 / FR-07）。204 を成功に正規化する。 */
export async function deleteArtwork(
  client: ArtworksClient,
  id: string,
): Promise<Result<null>> {
  try {
    const res = await client.api.artworks[":id"].$delete({ param: { id } });
    if (!res.ok) return fail(await errorFrom(res));
    return ok(null);
  } catch (e) {
    return fail(messageOf(e));
  }
}

function messageOf(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "通信に失敗しました";
}
