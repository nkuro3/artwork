# 01. プロトタイプ基盤のアーキテクチャ決定

---

## D1. モノレポ構成（bun workspaces + Turborepo）

- **文脈**: web / api / 共有パッケージ（database, ui, shared, config）を 1 リポジトリで扱う。型を跨いで共有したい
- **決定**: bun workspaces + Turborepo のモノレポ。`apps/*` と `packages/*`
- **帰結**: 型・スキーマ・UI を `packages/*` で共有。`turbo` でタスクキャッシュ。`packages/shared` を介して RPC 型を web と共有
- **代替案**: ポリレポ（共有が npm 公開 or git 依存になり煩雑）→ 不採用

## D2. 実行環境（Cloudflare Workers）

- **文脈**: フロント・API ともにエッジで動かし、R2 / Image Resizing と同一プラットフォームに寄せたい
- **決定**: web・api ともに Cloudflare Workers。web は **OpenNext**（`@opennextjs/cloudflare`）で Next.js を Workers へ、api は Workers ネイティブ（Hono）
- **帰結**: Node.js built-in は基本使えない。DB は neon-http、各種 SDK は fetch ベースを選ぶ。web のキャッシュは `unstable_cache` + `revalidateTag` に限定（`use cache` は OpenNext 安定まで不使用）
- **代替案**: web を Vercel に置く（プラットフォーム分散・R2/Images 連携が薄れる）→ 不採用

## D3. デプロイ境界（web / api を別 Worker）

- **文脈**: フロントと API のデプロイ・スケール・責務を分けたい
- **決定**: `apps/web`（Next）と `apps/api`（Hono）を**別 Worker** としてデプロイ
- **帰結**: それぞれ独立してデプロイ可能。web→api は HTTP（同一オリジン、D4）。将来 Service Binding に置換可能
- **代替案**: 単一 Worker に同梱（責務が混ざる・Next と Hono の同居が複雑）→ 不採用

## D4. ルーティング / オリジン（同一オリジン・パスベース）

- **文脈**: 別 Worker だが、認証 Cookie 共有と CORS の単純さを優先したい
- **決定**: **1 ドメイン（同一オリジン）でパスルーティング**。`/` → web Worker、`/api/*` → api Worker（Cloudflare のルート設定）
- **帰結**: CORS 不要。Cookie は Host-only / SameSite=Lax で web・api 双方に届く。Next 側は `/api` を自前で使わず api に集約する
- **代替案**: サブドメイン分離（`app.` / `api.`）→ 親ドメイン Cookie + CORS 設定が必要で煩雑 → 不採用

## D5. 型共有（Hono RPC + `@artwork/shared`）

- **文脈**: API の入出力型を web と二重定義したくない
- **決定**: api を Hono RPC で公開し、クライアント型を `@artwork/shared` 経由で web と共有
- **帰結**: API 変更が型で web に伝播。スキーマ（Drizzle）由来の型は API 境界で公開用の型に整形し、DB スキーマを web に直接漏らさない

## D6. 認証（Better Auth を api に配置）

- **文脈**: Better Auth は Drizzle アダプタで DB を使う。DB 所有者は api（D7）
- **決定**: Better Auth を **api Worker** に `/api/auth/*` でマウント（`auth.handler` を Hono に渡す）。認証テーブルも同一 Drizzle スキーマ（DB 規約どおり）
- **帰結**: 認証ロジックと DB が api に集約。Cookie は同一オリジン（D4）で共有
- **セッション取得（web→api）**: web の Server Component / Server Action が**受信 Cookie を api に転送**し、api 側 `getSession` で判定する（web は DB に触れない）。web に Better Auth クライアントは置かない
- **メール確認（verification）**: プロトタイプでは**必須にしない**（`requireEmailVerification=false`）。摩擦を下げる方針。メール送信基盤が整った段階で有効化を再検討
- **代替案**: Better Auth を web(Next) に置く（API も認可が必要で二重管理 / DB アクセスが web に漏れる）→ 不採用

## D7. DB アクセス（Neon + Drizzle、所有者は api のみ）

- **文脈**: 認可・バリデーションを一箇所に集約し、スキーマ依存を web に漏らさない
- **決定**: Neon (PostgreSQL) + Drizzle。`createDb()`（neon-http）を**呼ぶのは api Worker だけ**。web は常に API 経由
- **帰結**: 公開ポートフォリオ SSR も api 経由（web から Neon 直読みはしない）。マイグレーションは `packages/database` の素の SQL（pg_trgm/GIN/拡張は手書き）
- **簡易検索（仕様 §7.2）**: プロトタイプに**含める**。作品名等の部分一致を `pg_trgm` 拡張 + GIN index で実現し、migration に手書きで追加する
- **代替案**: 公開ページのみ web から Neon 直読み（速いが所有者が分散・スキーマ漏れ）→ 不採用

## D8. 認可（API のアプリ層で強制）

- **文脈**: 認可をどこで強制するか
- **決定**: **API のアプリ層**で `user_id` 一致を検証する
- **帰結**:
  - 認可ロジックは api に集約。DB の入口が api 1本（D7）なので、アプリ層チェックで認可が完結する
  - 所有者を持つテーブルに **`user_id` カラム + FK + index** を付与。アプリ層の所有者チェックは **共通関数（`assertOwner` 等）に集約**する

## D9. 画像配信（B: R2 オリジン変換）

- **文脈**: CLAUDE.md は「Cloudflare Images（R2 をオリジンに変換）」。原本の二重保持を避けたい
- **決定**: **R2 をオリジンにした Image Resizing**（`/cdn-cgi/image/width=.../<r2-object>`）。`artwork_image` は `r2_key` のみ保持。一覧=サムネ幅、詳細=大きい幅を URL パラメータで出し分け
- **帰結**: 原本は R2 のみ（二重保持なし・低メンテ）。変換は配信時オンザフライ（同期処理に依存しない）
- **ゾーン公開**: R2 バケットを **Cloudflare ゾーンのカスタムドメインに接続**して配信（Image Resizing は Cloudflare ゾーン経由が前提のため public bucket / r2.dev では不可）。同ゾーンで Image Resizing を有効化。カスタムドメイン接続自体は無料（DNS 設定のみ、固定費なし）
- **代替案**: A: Cloudflare Images に登録し `cf_image_id` + variants（原本が R2+Images に二重・ID 管理増）→ 不採用
- **代替案（ドメイン無しの場合）**: Worker 内の **Images バインディング `env.IMAGES`**（`input().transform().output()`）はゾーン不要で `workers.dev` 上でも変換でき、月 5,000 変換まで無料。独自ドメインを用意できない期間の退避先になるが、変換が Worker を経由する。**独自ドメインを確保したため不採用**（URL 変換 `/cdn-cgi/image/` を採る）

## D10. 画像アップロード（presigned URL で R2 へ直 PUT）

- **文脈**: Worker のリクエストボディ上限を避けつつ大きい画像を扱いたい
- **決定**: api が R2 の **presigned PUT URL**（S3 API / aws4fetch）を発行 → client が R2 へ**直接 PUT** → 完了通知で `artwork_image` 作成
- **帰結**: 画像が Worker を通らない（ボディ上限・転送コストを回避）。R2 の S3 キーを api シークレットに保持
- **代替案**: Worker の R2 binding 経由で put（S3 キー不要だが画像が Worker を通る）→ 不採用

## D11. シークレット / 環境変数（api に集約）

- **文脈**: 機密の配置先を明確にしたい。`.env.example` を正とする
- **決定**: 機密は基本 **api Worker** に集約。本番は `wrangler secret`、ローカルは `.dev.vars`

| 変数 | 配置先 | 備考 |
|---|---|---|
| `DATABASE_URL` | api | Neon 接続 |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | api | Better Auth |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | api | presigned URL 発行（S3 API） |
| `STRIPE_*` | api | ※正式版（02-payments） |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | web | ※正式版・公開可 |

- **帰結**: web はプロトタイプでは機密ほぼ不要。正式版で Stripe 系を追加（配置先は上表のとおり）

