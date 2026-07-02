import Link from "next/link";
import { AuthForm } from "../../components/auth-form";

export default function SignupPage() {
  return (
    <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <h1>サインアップ</h1>
      <AuthForm mode="signup" />
      <p>
        アカウントをお持ちの方は <Link href="/login">ログイン</Link>
      </p>
    </main>
  );
}
