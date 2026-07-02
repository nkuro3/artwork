import Link from "next/link";
import { AuthForm } from "../../components/auth-form";

export default function LoginPage() {
  return (
    <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <h1>ログイン</h1>
      <AuthForm mode="login" />
      <p>
        アカウントがない方は <Link href="/signup">サインアップ</Link>
      </p>
    </main>
  );
}
