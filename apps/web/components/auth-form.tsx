import type { CSSProperties, ReactNode } from "react";

// B2 認証画面の共通プレゼンテーション（仕様 02 §4 / §6.2-6.4）。
// フォーム用コンテナ幅（--container-form=480px）で中央寄せし、ラベル+入力を縦積みにする。
// 余白はトークン（space-3/4）。ロジックは持たない純プレゼン部品（テスト対象外、視覚は /verify）。

const containerStyle: CSSProperties = {
  maxWidth: "var(--container-form)",
  margin: "0 auto",
};

const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
};

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

const inputStyle: CSSProperties = {
  width: "100%",
};

const errorTextStyle: CSSProperties = {
  margin: `var(--space-1) 0 0`,
  fontSize: "var(--text-sm)",
};

const linkRowStyle: CSSProperties = {
  marginTop: "var(--space-6)",
};

/**
 * フォーム用コンテナ（480px・中央寄せ）。見出し以下のフォーム + 補助リンクをまとめる。
 * 見出し（h1）は §5.5 の階層順を保つため呼び出し側で AuthShell の外に置く。
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return <div style={containerStyle}>{children}</div>;
}

/** form 要素（縦積み・gap=space-4）。children に AuthField / 送信ボタン等を並べる。 */
export function AuthFormBody({
  children,
  onSubmit,
}: {
  children: ReactNode;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate style={formStyle}>
      {children}
    </form>
  );
}

/** ラベル + 入力の縦積み 1 行。error があれば aria-invalid と近傍エラー文を出す。 */
export function AuthField({
  label,
  name,
  type,
  autoComplete,
  hint,
  error,
}: {
  label: string;
  name: string;
  type: "text" | "email" | "password";
  autoComplete: string;
  hint?: string;
  error?: string | undefined;
}) {
  const errorId = error ? `${name}-error` : undefined;
  return (
    <div style={fieldStyle}>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        style={inputStyle}
      />
      {hint ? (
        <p style={{ ...errorTextStyle, color: "var(--color-text-muted)" }}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" style={errorTextStyle}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** フォーム下部の補助リンク（「サインアップへ」等）。 */
export function AuthLinkRow({ children }: { children: ReactNode }) {
  return <p style={linkRowStyle}>{children}</p>;
}
