"use server";

// D3 作品 Server Actions（FR-05）。next 依存の薄いラッパ（= ユニットテスト対象外）。
// `next/headers` の cookies() で受信 Cookie を取り、`createApiClient({ cookie })` を
// 作って lib/artworks のコアを呼ぶ（ADR D6 Cookie 転送 / ADR D7 必ず api 経由）。
// 純ロジック（バリデーション/正規化）は lib/artworks.test.ts で検証済み。

import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { createApiClient } from "../../lib/api";
import {
  createArtwork,
  deleteArtwork,
  updateArtwork,
  type CreateArtworkInput,
  type Result,
  type UpdateArtworkPatch,
} from "../../lib/artworks";
import { draftCreateInput } from "../../lib/artwork-edit";
import { portfolioTag } from "../../lib/portfolio";
import { getProfile } from "../../lib/profile";

/** 受信 Cookie ヘッダ文字列を組む（ADR D6）。 */
async function cookieHeader(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

/** 受信 Cookie を転送する作品 RPC クライアントを作る（ADR D6）。 */
async function clientFromCookies() {
  const cookie = await cookieHeader();
  return createApiClient(cookie ? { cookie } : {});
}

/**
 * 作品変更後、自分の公開ポートフォリオ（/p/:slug）のキャッシュを無効化する（NFR-06）。
 * 自分の slug はプロフィール API から取得する（web は DB に触れない / ADR D7）。
 * slug 取得に失敗しても作品操作自体は成功しているので無視する。
 */
async function revalidateOwnPortfolio(): Promise<void> {
  const cookie = await cookieHeader();
  const profileClient = createApiClient(cookie ? { cookie } : {});
  const profile = await getProfile(profileClient);
  if (profile.ok && profile.data.slug) {
    revalidateTag(portfolioTag(profile.data.slug));
    revalidatePath(`/p/${profile.data.slug}`);
  }
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

export async function createArtworkAction(
  form: FormData,
): Promise<Result<{ id: string }>> {
  const client = await clientFromCookies();
  const result = await createArtwork(client, readCreateInput(form));
  if (result.ok) {
    revalidatePath("/artworks");
    await revalidateOwnPortfolio();
  }
  return result.ok
    ? { ok: true, data: { id: result.data.id } }
    : { ok: false, error: result.error };
}

/**
 * 新規下書きを 1 件作成する（§6.6）。title 空・isDraft=true。
 * `/artworks/new` の RSC から呼び、作成した id へ遷移する。
 */
export async function createDraftArtworkAction(): Promise<
  Result<{ id: string }>
> {
  // 注: この関数は `/artworks/new` の RSC レンダー中に呼ばれるため、
  // ここで revalidatePath を呼んではいけない（Next がレンダー中の再検証を禁止）。
  // 直後に編集画面へ遷移し、一覧は次回アクセス時に再取得されるため不要。
  const client = await clientFromCookies();
  const result = await createArtwork(client, draftCreateInput());
  return result.ok
    ? { ok: true, data: { id: result.data.id } }
    : { ok: false, error: result.error };
}

/**
 * 作品を部分更新する（§6.7 自動保存・登録/保存）。
 * フォームは autosavePatch で組んだパッチ（isDraft 含む）を直接渡す。
 */
export async function updateArtworkAction(
  id: string,
  patch: UpdateArtworkPatch,
): Promise<Result<{ id: string }>> {
  const client = await clientFromCookies();
  const result = await updateArtwork(client, id, patch);
  if (result.ok) {
    revalidatePath("/artworks");
    revalidatePath(`/artworks/edit/${id}`);
    await revalidateOwnPortfolio();
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
  if (result.ok) {
    revalidatePath("/artworks");
    await revalidateOwnPortfolio();
  }
  return result;
}
