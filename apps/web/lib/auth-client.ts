import { createAuthClient } from "better-auth/react";

// ローカルは別オリジンの api を指す。本番は同一オリジン（相対 /api/auth）。
const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const authClient = createAuthClient({
  baseURL: `${baseURL}/api/auth`,
});
