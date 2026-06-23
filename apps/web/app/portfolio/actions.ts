"use server";

// §6.12 ポートフォリオ編集 Server Actions（FR-12,13 / ADR D12）。next 依存の薄いラッパ
//（= ユニットテスト対象外）。受信 Cookie を api に転送して lib/portfolio-edit のコアを呼ぶ
//（ADR D6 Cookie 転送 / ADR D7 必ず api 経由）。純ロジックは lib/portfolio-edit.test.ts で検証済み。

import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { createApiClient } from "../../lib/api";
import { putPortfolioMine } from "../../lib/portfolio-edit";
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

/** 自分の公開ポートフォリオ（/p/:slug）のキャッシュを無効化する（NFR-06）。 */
async function revalidateOwnPortfolio(cookie: string): Promise<void> {
  const profileClient = createApiClient(cookie ? { cookie } : {});
  const profile = await getProfile(profileClient);
  if (profile.ok && profile.data.slug) {
    revalidateTag(portfolioTag(profile.data.slug));
    revalidatePath(`/p/${profile.data.slug}`);
  }
}

/**
 * 掲載集合＋順序を確定する（§6.12）。掲載する作品 id を表示順で受け取り PUT する。
 * 成功時は公開ポートフォリオのキャッシュを無効化する。
 */
export async function savePortfolioAction(
  artworkIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cookie = await cookieHeader();
  const client = createApiClient(cookie ? { cookie } : {});
  const result = await putPortfolioMine(client, artworkIds);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/portfolio/edit");
  await revalidateOwnPortfolio(cookie);
  return { ok: true };
}
