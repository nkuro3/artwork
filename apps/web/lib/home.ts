import type { SessionUser } from "./session";

// B1 ホーム `/`（仕様 02 §6.1）のリダイレクト判定。
// ログイン済み（session あり）は /artworks へ誘導するためのフラグを返す純関数。
// 実際の `redirect()` 呼び出しはページ側（next 依存）に残し、ここは判定だけを担う。

/**
 * ホーム `/` でログイン済みリダイレクトすべきかを返す。
 * - session あり → true（呼び出し側で `/artworks` へ redirect）
 * - session null → false（ランディング表示）
 */
export function shouldRedirectHome(session: SessionUser | null): boolean {
  return session !== null;
}
