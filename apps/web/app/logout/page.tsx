import { LogoutButton } from "../../components/logout-button";

// D2 ログアウト画面（FR-01）。最小。ボタン押下で signOut → /login。

export default function LogoutPage() {
  return (
    <>
      <h1>ログアウト</h1>
      <p>ログアウトしますか？</p>
      <LogoutButton />
    </>
  );
}
