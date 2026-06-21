# プロトタイプ TDD タスク台帳

`docs/specs/01-prototype.md`（仕様）と `docs/adr/01-prototype.md`（決定）を実装に落とす台帳。
/loop の駆動対象。1 スライス = 1 イテレーション = 1 コミット。上から順に未完了（`[ ]`）を1つ選ぶ。

凡例: `[ ]` 未着手 / `[x]` 完了 / `🔒` インフラ・秘密情報が必要（未提供なら skip して報告） / 担当エージェント

---

## Phase A — 基盤（自走可）

- [ ] **A1 ツールチェーン** — `bun install`。vitest 導入（api は `@cloudflare/vitest-pool-workers`、packages は素の vitest）。`turbo.json` に `test` パイプライン追加。`packages/config` に共通 tsconfig / lint。受入: `bun run test`（0 件で可）/ `bun run typecheck` / `bun run lint` が通る。
- [ ] **A2 DB スキーマ** `@database` — `artist_profile` / `artwork` / `artwork_image` + Better Auth テーブル（user, session, account, verification）を `schema.ts` に定義。`bun run db:generate` でマイグレーション生成。末尾に **pg_trgm 拡張 + 検索列の GIN index** を手書き追記（NFR-05）。受入: マイグレーション SQL 生成、スキーマ型テスト緑。

## Phase B — ドメインロジック（純ロジック・自走可・TDD が最も効く）

- [ ] **B1 認可ガード** `@api` — `assertOwner(userId, row)` と認可エラー。先にテスト（一致=通過 / 不一致=403）。FR-10 / SEC-01。
- [ ] **B2 slug** `@api` — 生成・正規化・バリデーション・予約語/重複チェックヘルパ。先にテスト。FR-03 / FR-11。
- [ ] **B3 sort_order** `@api` — 並び替え（挿入・移動）ロジック。先にテスト。FR-09 / FR-13。
- [ ] **B4 公開可視判定** `@api` — `is_public === true && status === 'published'` のフィルタ。先にテスト。FR-12。
- [ ] **B5 画像 URL 生成** `@api` — `src/lib/image/`。`/cdn-cgi/image/width=.../<r2_key>` を用途別幅で生成。先にテスト。FR-15 / NFR-03。
- [ ] **B6 R2 署名 URL** `@api` — `src/lib/storage.ts`。aws4fetch で短命・スコープ限定の presigned PUT を組立（鍵はモック）。先にテストで署名入力を検証。NFR-02 / SEC-06。
- [ ] **B7 検索クエリ組立** `@api` — pg_trgm の類似度/部分一致 SQL フラグメント生成。先にテスト。FR-17 / NFR-05。

## Phase C — API（Hono RPC）

- [ ] **C1 認証マウント + セッション middleware** `@api` — `auth.handler` を `/api/auth/*` に。`getSession` から `user` を載せる middleware（`getSession` はモック）。ADR D6 / FR-01,02。
- [ ] **C2 作品 CRUD** `@api` — `POST/GET/GET:id/PATCH/DELETE /artworks`。全変更系で B1 の所有者検証。リポジトリ層はモック（🔒 実 DB 統合は E2）。FR-05,07,08。
- [ ] **C3 画像ルート** `@api` — `POST /uploads/sign`（B6）/ `POST /artworks/:id/images`（メタ作成）/ `DELETE /images/:id` / 並び替え（B3）。FR-06,07。
- [ ] **C4 公開ポートフォリオ** `@api` — `GET /portfolio/:slug`（未認証、B4 で絞り込み）。FR-11,12,13。
- [ ] **C5 検索ルート + RPC 型公開** `@api` — `GET /search`（B7）。RPC クライアント型を `@artwork/shared` に export。NFR-11 / FR-17。

## Phase D — Web（Next App Router）

- [ ] **D1 RPC クライアント + Cookie 転送** `@web` — api クライアントと、受信 Cookie を api に引き継ぐ `getSession` ヘルパ。ADR D6。
- [ ] **D2 認証画面** `@web` — `/login` `/signup` `/logout`。Better Auth クライアント呼び出し。FR-01。
- [ ] **D3 作品管理 UI** `@web` — 一覧 / 作成 / 編集 / 削除（Server Action → api）。画像アップロードは署名 URL → R2 直 PUT → メタ通知。FR-05,06。
- [ ] **D4 設定** `@web` — プロフィール / slug / 公開設定。FR-03。
- [ ] **D5 公開ポートフォリオ SSR** `@web` — `/p/:slug` を SSR + `unstable_cache`/`revalidateTag`、最小 SEO/OGP（先頭画像）。FR-11〜16 / NFR-06。
- [ ] **D6 作品詳細（公開）** `@web` — `/p/:slug/:artworkId`。画像は詳細用大サイズ。FR-14,15。

## Phase E — 統合・本番結線（🔒 あなたの認証情報が必要）

- [ ] **E1 🔒 プロビジョニング** — Neon ブランチ + `DATABASE_URL`、R2 バケット + S3 キー、`BETTER_AUTH_SECRET`、`wrangler.toml`（api `[vars]`/secret、web ルート）、Cloudflare ルート `/api/*` → api Worker、R2 カスタムドメイン + Image Resizing 有効化。`.dev.vars` 整備。
- [ ] **E2 🔒 マイグレーション適用 + e2e スモーク** — Neon に migrate 適用。skip していた統合テストを有効化。サインアップ→作品作成→画像アップロード→公開→ポートフォリオ閲覧を通す（`/verify` 併用）。

---

## 完了の定義（各スライス共通）

1. 先にテストを書き、赤を確認してから実装した
2. `bun run test` / `bun run typecheck` / `bun run lint` が緑
3. 仕様の対応 FR/NFR/SEC を満たす
4. Conventional Commits で 1 コミット、本台帳の該当行を `[x]` に更新
