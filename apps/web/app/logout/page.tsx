import { AuthShell } from "../../components/auth-form";
import { LogoutButton } from "../../components/logout-button";

// B2 ログアウト画面（仕様 02 §6.4 / FR-01）。最小。確認テキスト + ボタン押下で signOut → /login。
// フォーム用コンテナ幅（480px）で他の認証画面と揃える。

export default function LogoutPage() {
  return (
    <AuthShell>
      <h1>ログアウト</h1>
      <p style={{ marginBottom: "var(--space-6)" }}>ログアウトしますか？</p>
      <LogoutButton />
    </AuthShell>
  );
}
