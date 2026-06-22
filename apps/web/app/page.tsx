import { redirect } from "next/navigation";
import { shouldRedirectHome } from "../lib/home";
import { getSession } from "../lib/session";

// B1 ホーム `/`（仕様 02 §6.1）。サービスの入口。
// ログイン済みは /artworks へリダイレクト、未ログインはランディング表示。
// リダイレクト判定は純ロジック（lib/home）に委譲し、ページは薄く保つ。

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  if (shouldRedirectHome(session)) redirect("/artworks");

  return (
    <>
      <h1>アートワーク</h1>
      <p>作品を登録して公開ポートフォリオを作る</p>
      <p>
        <a href="/login">ログイン</a>
        <a href="/signup">登録</a>
      </p>
    </>
  );
}
