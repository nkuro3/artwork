"use server";

// D4 設定 Server Actions（FR-03）。next 依存の薄いラッパ（= ユニットテスト対象外）。
// `next/headers` の cookies() で受信 Cookie を取り、`createApiClient({ cookie })` を作って
// lib/profile のコアを呼ぶ（ADR D6 Cookie 転送 / ADR D7 必ず api 経由）。
// 純ロジック（バリデーション/正規化）は lib/profile.test.ts で検証済み。

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { asProfileClient, createApiClient } from "../../lib/api";
import { updateProfile, type ProfilePatch, type Result } from "../../lib/profile";

/** 受信 Cookie を転送する RPC クライアントを作る（ADR D6）。 */
async function clientFromCookies() {
  const store = await cookies();
  const cookie = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  return asProfileClient(createApiClient(cookie ? { cookie } : {}));
}

/** FormData から更新パッチを組む（送られたフィールドのみ）。 */
function readPatch(form: FormData): ProfilePatch {
  const patch: ProfilePatch = {};
  const displayName = form.get("displayName");
  if (typeof displayName === "string") patch.displayName = displayName;
  const slug = form.get("slug");
  if (typeof slug === "string") patch.slug = slug;
  const bio = form.get("bio");
  if (typeof bio === "string") patch.bio = bio.trim() === "" ? null : bio;
  patch.isPublic =
    form.get("isPublic") === "on" || form.get("isPublic") === "true";
  return patch;
}

export async function updateProfileAction(
  form: FormData,
): Promise<Result<{ slug: string }>> {
  const client = await clientFromCookies();
  const result = await updateProfile(client, readPatch(form));
  if (result.ok) {
    revalidatePath("/settings");
    // slug 変更は公開ポートフォリオ URL（/p/:slug）に影響するため関連 path も無効化する。
    revalidatePath(`/p/${result.data.slug}`);
  }
  return result.ok
    ? { ok: true, data: { slug: result.data.slug } }
    : { ok: false, error: result.error };
}
