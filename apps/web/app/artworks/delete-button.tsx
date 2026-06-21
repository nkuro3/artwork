"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteArtworkAction } from "./actions";

// D3 削除ボタン（FR-05 / FR-07）。Server Action を呼び、成功後に一覧を更新する。
// 薄いクライアントコンポーネント。レンダリングテストは行わず /verify で確認する。

export function DeleteArtworkButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!confirm("この作品を削除しますか？")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteArtworkAction(id);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button type="button" onClick={onClick} disabled={pending}>
        削除
      </button>
      {error ? <span role="alert">{error}</span> : null}
    </>
  );
}
