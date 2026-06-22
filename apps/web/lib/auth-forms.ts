// D2 認証フォームの純ロジック（FR-01 / ADR D6）。
// 検証（validate*）と送信（submit*）を client 非依存・純ロジックとして実装する。
// client は注入（AuthFormsClient）し、テストではモック、本番では auth-client の
// アダプタを渡す。web は Better Auth の HTTP クライアント（D6 のクライアント SDK）
// のみを使い、DB には触れない。

/** フィールド単位のエラー。`form` はフォーム全体（サーバー失敗など）に使う。 */
export interface FormErrors {
  email?: string;
  password?: string;
  displayName?: string;
  form?: string;
}

export interface LoginValues {
  email: string;
  password: string;
}

export interface SignupValues {
  email: string;
  password: string;
  displayName?: string;
}

/** submit* の結果。成功なら ok:true、失敗ならフィールド/フォームのエラーを持つ。 */
export type SubmitResult =
  | { ok: true }
  | { ok: false; errors: FormErrors };

/**
 * 注入される認証クライアントの最小インターフェース。
 * Better Auth の `signIn.email` / `signUp.email` / `signOut` を薄く包んだ形で、
 * `{ data, error }` を返す（テストではこのインターフェースをモックする）。
 */
export interface AuthFormsClient {
  signIn(input: { email: string; password: string }): Promise<AuthResult>;
  signUp(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<AuthResult>;
  signOut(): Promise<AuthResult>;
}

/**
 * Better Auth の応答に揃えた最小の結果形。
 * 成功時は `error` が無い/null、失敗時は `error.message`（任意）を持つ。
 * Better Auth は成功/失敗で排他的な型（data だけ / error だけ）を返すため、
 * 双方を任意プロパティにして構造的に受けられるようにする。
 */
export interface AuthResult {
  data?: unknown;
  // message は string | undefined を許容（Better Auth の error.message に揃える。
  // exactOptionalPropertyTypes 下でアダプタの引数を構造的に受けるため）。
  error?: { message?: string | undefined } | null;
}

const PASSWORD_MIN_LENGTH = 8;
// 1 つの @、@ より前後に空白なし、ドメインに少なくとも 1 つのドット。簡易だが実用十分。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(raw: string): string | undefined {
  const email = raw.trim();
  if (!email) return "メールアドレスを入力してください";
  if (!EMAIL_RE.test(email)) return "メールアドレスの形式が正しくありません";
  return undefined;
}

/**
 * ログイン入力の検証。エラーオブジェクト（空なら妥当）を返す。
 * ログインは登録済み資格情報の照合なので、パスワードは長さ要件を課さず存在のみ確認する。
 */
export function validateLogin(values: LoginValues): FormErrors {
  const errors: FormErrors = {};
  const emailError = validateEmail(values.email);
  if (emailError) errors.email = emailError;
  if (!values.password) errors.password = "パスワードを入力してください";
  return errors;
}

/**
 * サインアップ入力の検証。エラーオブジェクト（空なら妥当）を返す。
 * パスワードは 8 文字以上、displayName は省略可（指定時は空白のみ不可）。
 */
export function validateSignup(values: SignupValues): FormErrors {
  const errors: FormErrors = {};
  const emailError = validateEmail(values.email);
  if (emailError) errors.email = emailError;
  if (!values.password) {
    errors.password = "パスワードを入力してください";
  } else if (values.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `パスワードは ${PASSWORD_MIN_LENGTH} 文字以上にしてください`;
  }
  if (values.displayName !== undefined && values.displayName.trim() === "") {
    errors.displayName = "表示名を入力してください";
  }
  return errors;
}

function hasErrors(errors: FormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** AuthResult / 例外を SubmitResult に正規化する。 */
function normalize(result: AuthResult): SubmitResult {
  if (result.error) {
    return {
      ok: false,
      errors: { form: result.error.message || "エラーが発生しました" },
    };
  }
  return { ok: true };
}

/**
 * ログイン送信。まず検証 → エラーなら early return（client 未呼び出し）。
 * 妥当なら注入 client の signIn を呼び、結果を正規化して返す。例外も ok:false に倒す。
 */
export async function submitLogin(
  client: AuthFormsClient,
  values: LoginValues,
): Promise<SubmitResult> {
  const errors = validateLogin(values);
  if (hasErrors(errors)) return { ok: false, errors };

  try {
    const result = await client.signIn({
      email: values.email.trim(),
      password: values.password,
    });
    return normalize(result);
  } catch (e) {
    return { ok: false, errors: { form: errorMessage(e) } };
  }
}

/**
 * サインアップ送信。検証 → 妥当なら signUp を呼ぶ。
 * displayName 省略時はメールのローカル部を name に補完する（Better Auth は name 必須）。
 */
export async function submitSignup(
  client: AuthFormsClient,
  values: SignupValues,
): Promise<SubmitResult> {
  const errors = validateSignup(values);
  if (hasErrors(errors)) return { ok: false, errors };

  const email = values.email.trim();
  const displayName = values.displayName?.trim();
  const name = displayName || email.split("@")[0] || email;

  try {
    const result = await client.signUp({
      email,
      password: values.password,
      name,
    });
    return normalize(result);
  } catch (e) {
    return { ok: false, errors: { form: errorMessage(e) } };
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "通信に失敗しました";
}
