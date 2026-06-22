import { redirect } from "next/navigation";
import { getSession } from "../../../lib/session";
import { ArtworkForm } from "../artwork-form";

// D3 作品作成（FR-05 / FR-06）。要ログイン領域。薄い RSC でセッションを確認し、
// 入力は ArtworkForm（クライアント）に委譲する。レンダリングは /verify で確認。

export default async function NewArtworkPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <>
      <h1>作品を作成</h1>
      <ArtworkForm />
    </>
  );
}
