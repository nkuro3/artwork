import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { asArtworksClient, createApiClient } from "../../../../lib/api";
import { getArtwork } from "../../../../lib/artworks";
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
  const client = asArtworksClient(createApiClient(cookie ? { cookie } : {}));
  const result = await getArtwork(client, id);
  if (!result.ok) notFound();

  const art = result.data;

  return (
    <main>
      <h1>作品を編集</h1>
      <ArtworkForm
        artworkId={art.id}
        defaults={{
          title: art.title,
          description: art.description ?? "",
          status: art.status,
          isPublic: art.isPublic,
        }}
      />
      <p>
        <a href="/artworks">一覧へ戻る</a>
      </p>
    </main>
  );
}
