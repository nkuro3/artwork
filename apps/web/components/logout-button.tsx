"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "../lib/auth-client";

// D2 ログアウト（FR-01）。Better Auth クライアントの signOut を呼び /login へ。
// 最小実装。レンダリングテストは行わず /verify で確認する。

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <button type="button" onClick={onClick} disabled={pending}>
      ログアウト
    </button>
  );
}
