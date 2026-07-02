import Link from "next/link";
import { ArtworkForm } from "../../../components/artwork-form";

export default function NewArtworkPage() {
  return (
    <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <h1>作品の新規作成</h1>
      <Link href="/artworks">一覧へ戻る</Link>
      <ArtworkForm />
    </main>
  );
}
