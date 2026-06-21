import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createApiClient } from "../../lib/api";
import { getProfile } from "../../lib/profile";
import { getSession } from "../../lib/session";
import { SettingsForm } from "./settings-form";

// D4 設定（FR-03 プロフィール / slug / 公開設定）。要ログイン領域の RSC。受信 Cookie を
// api に転送して現在のプロフィールを取得し（無ければ api 側で lazy init / FR-03）、
// SettingsForm に初期値を渡す。更新は Server Action 経由。レンダリングは /verify で確認。

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const store = await cookies();
  const cookie = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const client = createApiClient(cookie ? { cookie } : {});
  const result = await getProfile(client);

  if (!result.ok) {
    return (
      <main>
        <h1>設定</h1>
        <p role="alert">プロフィールの取得に失敗しました: {result.error}</p>
      </main>
    );
  }

  const profile = result.data;

  return (
    <main>
      <h1>設定</h1>
      <SettingsForm
        defaults={{
          displayName: profile.displayName,
          slug: profile.slug,
          bio: profile.bio ?? "",
          isPublic: profile.isPublic,
        }}
      />
      <p>
        <a href="/artworks">作品一覧へ</a>
      </p>
    </main>
  );
}
