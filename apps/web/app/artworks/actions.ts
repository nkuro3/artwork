"use server";

// D3 作品 Server Actions（FR-05）。next 依存の薄いラッパ（= ユニットテスト対象外）。
// `next/headers` の cookies() で受信 Cookie を取り、`createApiClient({ cookie })` を
// 作って lib/artworks のコアを呼ぶ（ADR D6 Cookie 転送 / ADR D7 必ず api 経由）。
// 純ロジック（バリデーション/正規化）は lib/artworks.test.ts で検証済み。

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { asArtworksClient, createApiClient } from "../../lib/api";
import {
  createArtwork,
  deleteArtwork,
  updateArtwork,
  type CreateArtworkInput,
  type Result,
  type UpdateArtworkPatch,
} from "../../lib/artworks";

/** 受信 Cookie を転送する RPC クライアントを作る（ADR D6）。 */
async function clientFromCookies() {
  const store = await cookies();
  const cookie = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  return asArtworksClient(createApiClient(cookie ? { cookie } : {}));
}

/** FormData から作成入力を組む。空文字は未指定扱い（description は null）。 */
function readCreateInput(form: FormData): CreateArtworkInput {
  const input: CreateArtworkInput = {
    title: String(form.get("title") ?? ""),
  };
  const description = form.get("description");
  if (typeof description === "string") {
    input.description = description.trim() === "" ? null : description;
  }
  const status = form.get("status");
  if (status === "draft" || status === "published") input.status = status;
  input.isPublic = form.get("isPublic") === "on" || form.get("isPublic") === "true";
  return input;
}

/** FormData から更新パッチを組む（送られたフィールドのみ）。 */
function readUpdatePatch(form: FormData): UpdateArtworkPatch {
  const patch: UpdateArtworkPatch = {};
  const title = form.get("title");
  if (typeof title === "string") patch.title = title;
  const description = form.get("description");
  if (typeof description === "string") {
    patch.description = description.trim() === "" ? null : description;
  }
  const status = form.get("status");
  if (status === "draft" || status === "published") patch.status = status;
  patch.isPublic = form.get("isPublic") === "on" || form.get("isPublic") === "true";
  return patch;
}

export async function createArtworkAction(
  form: FormData,
): Promise<Result<{ id: string }>> {
  const client = await clientFromCookies();
  const result = await createArtwork(client, readCreateInput(form));
  if (result.ok) revalidatePath("/artworks");
  return result.ok
    ? { ok: true, data: { id: result.data.id } }
    : { ok: false, error: result.error };
}

export async function updateArtworkAction(
  id: string,
  form: FormData,
): Promise<Result<{ id: string }>> {
  const client = await clientFromCookies();
  const result = await updateArtwork(client, id, readUpdatePatch(form));
  if (result.ok) {
    revalidatePath("/artworks");
    revalidatePath(`/artworks/edit/${id}`);
  }
  return result.ok
    ? { ok: true, data: { id: result.data.id } }
    : { ok: false, error: result.error };
}

export async function deleteArtworkAction(
  id: string,
): Promise<Result<null>> {
  const client = await clientFromCookies();
  const result = await deleteArtwork(client, id);
  if (result.ok) revalidatePath("/artworks");
  return result;
}
