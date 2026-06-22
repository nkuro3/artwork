import { redirect } from "next/navigation";
import { getSession } from "../../../lib/session";
import { createDraftArtworkAction } from "../actions";

// D3 作品作成（§6.6）。要ログイン領域。フォームは持たず、アクセス時に下書き
// （isDraft=true・title 空）を 1 件作成し、編集画面へリダイレクトする（編集に集約）。
// 新規作成は常に新しい下書きを作る。作成失敗時はエラーを表示し、一覧へ戻す導線を出す。

export const dynamic = "force-dynamic";

export default async function NewArtworkPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const created = await createDraftArtworkAction();
  if (created.ok) redirect(`/artworks/edit/${created.data.id}`);

  return (
    <>
      <h1>作品を作成</h1>
      <p role="alert">下書きの作成に失敗しました: {created.error}</p>
      <p>
        <a href="/artworks">一覧へ戻る</a>
      </p>
    </>
  );
}
