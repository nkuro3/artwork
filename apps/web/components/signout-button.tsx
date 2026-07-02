"use client";

import { useRouter } from "next/navigation";
import { authClient } from "../lib/auth-client";

export function SignoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.refresh();
      }}
    >
      サインアウト
    </button>
  );
}
