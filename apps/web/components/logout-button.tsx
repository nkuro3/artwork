"use client";

import { useRouter } from "next/navigation";
import { authClient } from "../lib/auth-client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.refresh();
      }}
    >
      ログアウト
    </button>
  );
}
