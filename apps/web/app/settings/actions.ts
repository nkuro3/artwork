"use server";

// D4 設定 Server Actions（FR-03）。next 依存の薄いラッパ（= ユニットテスト対象外）。
// `next/headers` の cookies() で受信 Cookie を取り、`createApiClient({ cookie })` を作って
// lib/profile のコアを呼ぶ（ADR D6 Cookie 転送 / ADR D7 必ず api 経由）。
// 純ロジック（バリデーション/正規化）は lib/profile.test.ts で検証済み。

import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { createApiClient } from "../../lib/api";
import { portfolioTag } from "../../lib/portfolio";
import {
  getProfile,
  updateProfile,
  type ProfilePatch,
  type Result,
} from "../../lib/profile";

/** 受信 Cookie を転送する RPC クライアントを作る（ADR D6）。 */
async function clientFromCookies() {
  const store = await cookies();
  const cookie = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  return createApiClient(cookie ? { cookie } : {});
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
  // 公開制御は作品単位の is_public に統一（§6.8）。プロフィール公開トグルは
  // 設けないため isPublic は送らない（lib/profile / api のシグネチャは不変）。
  return patch;
}

export async function updateProfileAction(
  form: FormData,
): Promise<Result<{ slug: string }>> {
  const client = await clientFromCookies();

  // slug 変更時に旧 slug のキャッシュタグも無効化するため、更新前の slug を控える
  //（D4 申し送りの解消 / NFR-06）。取得失敗は致命ではないので無視して続行する。
  const before = await getProfile(client);
  const oldSlug = before.ok ? before.data.slug : null;

  const result = await updateProfile(client, readPatch(form));
  if (result.ok) {
    revalidatePath("/settings");
    // 公開ポートフォリオ（/p/:slug）のキャッシュを無効化（NFR-06）。
    revalidateTag(portfolioTag(result.data.slug));
    revalidatePath(`/p/${result.data.slug}`);
    // slug が変わった場合は旧 slug のキャッシュも無効化する（旧 URL を残さない）。
    if (oldSlug && oldSlug !== result.data.slug) {
      revalidateTag(portfolioTag(oldSlug));
      revalidatePath(`/p/${oldSlug}`);
    }
  }
  return result.ok
    ? { ok: true, data: { slug: result.data.slug } }
    : { ok: false, error: result.error };
}
