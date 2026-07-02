import type { AppType } from "@artwork/api";
import { hc } from "hono/client";

// ローカルは別オリジンの api を指す。本番は同一オリジン（相対パス）。
const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "";

// ブラウザから叩く RPC クライアント。セッション Cookie を常に添える。
export const api = hc<AppType>(baseURL, {
  init: { credentials: "include" },
});

// RPC 型に乗らない書き込み系（バリデータ未導入のため）に使う素の fetch。
export function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${baseURL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

// 一覧・詳細レスポンスの作品型（API の返却 JSON 由来）。
export type Artwork = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: "in_progress" | "available" | "sold" | null;
  publicStatus: "draft" | "public" | "archived";
  medium: string | null;
  artType: string | null;
  condition: string | null;
  heightMm: number | null;
  widthMm: number | null;
  depthMm: number | null;
  weightG: number | null;
  createdAt: string;
  updatedAt: string;
};

// 作成・更新フォームが送る入力型。
export type ArtworkInput = {
  title: string;
  description: string | null;
  status: Artwork["status"];
  publicStatus: Artwork["publicStatus"];
  medium: string | null;
  artType: string | null;
  condition: string | null;
  heightMm: number | null;
  widthMm: number | null;
  depthMm: number | null;
  weightG: number | null;
};
