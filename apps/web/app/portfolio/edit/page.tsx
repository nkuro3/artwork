import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createApiClient } from "../../../lib/api";
import { getPortfolioMine } from "../../../lib/portfolio-edit";
import { getProfile } from "../../../lib/profile";
import { getSession } from "../../../lib/session";
import { PortfolioEditor } from "./portfolio-editor";

// §6.12 ポートフォリオ編集（FR-12,13 / ADR D12）。要ログイン領域の RSC。
// 受信 Cookie を api に転送して、自分の published 作品（掲載状態/順序付き）と
// プロフィール（slug）を取得し、クライアント編集コンポーネントへ渡す（ADR D6 / D7）。
// 保存は Server Action（savePortfolioAction）経由。レンダリングは /verify で確認する。

export const dynamic = "force-dynamic";

export default async function PortfolioEditPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const store = await cookies();
  const cookie = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const client = createApiClient(cookie ? { cookie } : {});

  const [mine, profile] = await Promise.all([
    getPortfolioMine(client),
    getProfile(client),
  ]);

  const slug = profile.ok ? profile.data.slug : null;

  return (
    <>
      <h1>ポートフォリオ編集</h1>
      {!mine.ok ? (
        <p role="alert">公開作品の取得に失敗しました: {mine.error}</p>
      ) : (
        <PortfolioEditor artworks={mine.data} slug={slug} />
      )}
    </>
  );
}
