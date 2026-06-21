# 00. アーキテクチャ全体図

> ステータス: **Living document**（構成が変わるたびに更新する）
> 役割: システム全体の構成・コンポーネント・データフローの俯瞰図、および ADR の索引。
> 個別の決定とその根拠は番号付き ADR（`01-` 以降）に残す。CLAUDE.md は AI 用エントリーポイントであり、決定の記録場所ではない。

---

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
| DB | Neon (PostgreSQL) + Drizzle ORM | **api のみ**が `createDb()`（neon-http）で接続 |
| ストレージ | Cloudflare R2 | 画像原本。client から presigned URL で直接 PUT |
| 画像配信 | Cloudflare Image Resizing（R2 オリジン変換） | `/cdn-cgi/image/...` でオンザフライ変換配信 |
| 決済 | Stripe | ※正式版（[`02-payments.md`](./02-payments.md) 予定） |

---

## 3. 主要なデータフロー

- **公開ポートフォリオ閲覧（未認証）**: Browser → web Worker（SSR, `unstable_cache`）→ api `/api/portfolio/:slug` → Neon。画像は `/cdn-cgi/image/...` 経由で R2 から変換配信
- **作品の作成 + 画像アップロード（認証）**: web → api `/api/uploads/sign`（presigned URL）→ client が R2 へ直接 PUT → web → api `/api/artworks/:id/images`（メタ作成）
- **認証**: web → api `/api/auth/*`（Better Auth）。セッション Cookie は同一オリジンのため Host-only / SameSite=Lax で web・api 双方に届く

---

## 4. 横断的な取り決め

- **オリジン / ルーティング**: 同一オリジンでパスルーティング（`/` → web、`/api/*` → api）。CORS 不要
- **型共有**: api を Hono RPC で公開し、型を `@artwork/shared` 経由で web と共有
- **DB 所有者**: api Worker のみ。web は Neon に直接つながず、常に API 経由
- **機密の配置**: 機密は基本 api Worker に集約（`DATABASE_URL` / `BETTER_AUTH_SECRET` / R2 の S3 キー等）。web はプロトタイプでは機密ほぼ不要
- **キャッシュ**（web）: `unstable_cache` + `revalidateTag`。`use cache` / `cacheComponents` は OpenNext 安定まで不使用（apps/web 規約）
- **最適化メモ**: web→api の内部呼び出しは将来 Cloudflare **Service Binding**（Worker 間直結）に置換して HTTP 往復を省ける

---

## 5. ADR 索引

| ADR | テーマ | ステータス |
|---|---|---|
| [01-prototype](./01-prototype.md) | プロトタイプ基盤（モノレポ・実行環境・ルーティング・認証・DB・画像） | Accepted（ドラフト） |
| 02-payments（予定） | 決済（Stripe） | 正式版で追加 |
| 03-email（予定） | メール送信 | 正式版で追加 |

> 運用ルール: 既存の決定が後から覆る場合は、その時点で独立した ADR として切り出し、元の決定を superseded にする。最初から細分化はしない。
