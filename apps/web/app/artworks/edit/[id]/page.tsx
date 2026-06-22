import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createApiClient } from "../../../../lib/api";
import { getArtwork, getArtworkImages } from "../../../../lib/artworks";
import { getSession } from "../../../../lib/session";
import { ArtworkForm } from "../../artwork-form";

// D3 作品編集（FR-05 / FR-06）。要ログイン領域の RSC。受信 Cookie を api に転送して
// 現在値を取得し（所有者検証は api 側 / SEC-01）、ArtworkForm に初期値を渡す。
// レンダリングは /verify で確認する。

export const dynamic = "force-dynamic";

export default async function EditArtworkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const store = await cookies();
  const cookie = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const client = createApiClient(cookie ? { cookie } : {});
  // 作品の現在値と既存画像を並行取得（所有者検証は api 側 / SEC-01・B4b §6.7）。
  const [result, imagesResult] = await Promise.all([
    getArtwork(client, id),
    getArtworkImages(client, id),
  ]);
  if (!result.ok) notFound();

  const art = result.data;
  // 画像取得が失敗してもメタ編集は続行できるよう、失敗時は空配列にフォールバックする。
  const initialImages = imagesResult.ok ? imagesResult.data : [];

  return (
    <>
      <h1>作品を編集</h1>
      <ArtworkForm
        artworkId={art.id}
        isDraft={art.isDraft}
        initialImages={initialImages}
        defaults={{
          title: art.title,
          description: art.description ?? "",
          status: art.status,
          isPublic: art.isPublic,
        }}
      />
    </>
  );
}
