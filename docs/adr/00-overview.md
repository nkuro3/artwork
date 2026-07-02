# 00. アーキテクチャ全体図

## 1. 全体構成

すべて Cloudflare（Workers / R2 / Image Resizing）上で動く。web と api は**別 Worker**だが、
**同一オリジン**（1 ドメイン）でパスルーティングし、`/api/*` のみ api Worker に振り分ける。

![全体構成図](./drawio/00-overview.svg)


---

## 2. コンポーネント

| コンポーネント | 実体 | 役割 |
|---|---|---|
| web Worker | Next.js (App Router) を OpenNext で Workers にデプロイ | UI / SSR。データは API 経由でのみ取得 |
| api Worker | Hono on Cloudflare Workers（RPC モード） | ドメインロジック・DB アクセス・認証・R2 署名発行 |
| 認証 | Better Auth（Drizzle アダプタ）を api に `/api/auth/*` でマウント | セッション管理。認証テーブルも同一 DB スキーマ |
| DB | Neon (PostgreSQL) + Drizzle ORM | api のみが `createDb()`（neon-http）で接続 |
| ストレージ | Cloudflare R2 | 画像原本。client から presigned URL で直接 PUT |
| 画像配信 | Cloudflare Image Resizing（R2 オリジン変換） | `/cdn-cgi/image/...` でオンザフライ変換配信 |
| 決済 | Stripe |  |
| メール送信 | Resend |  |
