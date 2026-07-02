"use client";

import Link from "next/link";
import { SignoutButton } from "../components/signout-button";
import { authClient } from "../lib/auth-client";

export default function HomePage() {
  const { data: session, isPending } = authClient.useSession();

  return (
    <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <h1>artwork</h1>
      {isPending ? (
        <p>読み込み中…</p>
      ) : session ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p>
            サインイン中: {session.user.name}（{session.user.email}）
          </p>
          <div>
            <SignoutButton />
          </div>
        </div>
      ) : (
        <nav style={{ display: "flex", gap: 16 }}>
          <Link href="/signin">サインイン</Link>
          <Link href="/signup">サインアップ</Link>
        </nav>
      )}
    </main>
  );
}
