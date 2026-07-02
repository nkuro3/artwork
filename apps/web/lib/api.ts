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

// 作品画像（API の返却 JSON 由来）。
export type ArtworkImage = {
  id: string;
  artworkId: string | null;
  userId: string;
  storageKey: string;
  sortOrder: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
};

// 画像の表示 URL。
// 本番: R2 公開ドメイン + Image Resizing（/cdn-cgi/image でオンザフライ変換）。
// ローカル: エッジを通らず変換不可のため、api 経由のオリジナル配信にフォールバック。
const imageBaseURL = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? "";

export function imageFileUrl(image: ArtworkImage, width?: number) {
  if (imageBaseURL) {
    const options = width ? `width=${width},format=auto` : "format=auto";
    return `${imageBaseURL}/cdn-cgi/image/${options}/${image.storageKey}`;
  }
  return `${baseURL}/api/images/${image.id}/file`;
}

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
  imageIds: string[];
};
