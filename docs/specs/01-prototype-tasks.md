# プロトタイプ TDD タスク台帳

`docs/specs/01-prototype.md`（仕様）と `docs/adr/01-prototype.md`（決定）を実装に落とす台帳。
/loop の駆動対象。1 スライス = 1 イテレーション = 1 コミット。上から順に未完了（`[ ]`）を1つ選ぶ。

凡例: `[ ]` 未着手 / `[x]` 完了 / `🔒` インフラ・秘密情報が必要（未提供なら skip して報告） / 担当エージェント

---

## Phase A — 基盤（自走可）

- [x] **A1 ツールチェーン** — `bun install`。素の vitest を全ワークスペースに導入、`turbo` に test/lint パイプライン、`packages/config` に共通 tsconfig（`./typescript`）+ ESLint flat config（`./eslint`）。各ワークスペースに `tsconfig.json` と最小ソース（api: Hono health、web: 最小 App Router）。受入達成: `bun run test` / `typecheck` / `lint` すべて緑。<br>※ `@cloudflare/vitest-pool-workers` は vitest バージョンを厳密固定し未知を抱えるため **C1 に延期**。Phase B の純ロジックは素の vitest で回す。
- [x] **A2 DB スキーマ** `@database` — `artist_profile` / `artwork` / `artwork_image` + Better Auth テーブル（user, session, account, verification）を `schema.ts` に定義。`bun run db:generate` でマイグレーション生成。末尾に **pg_trgm 拡張 + 検索列の GIN index** を手書き追記（NFR-05）。受入達成: 27 ケースの schema テスト緑、`0000_*.sql` 生成 + pg_trgm/GIN(trgm) 3本手書き。Better Auth テーブルは `@better-auth/core` の `getAuthTables` から写経。Neon 適用は未実施（別スライス）。

## Phase B — ドメインロジック（純ロジック・自走可・TDD が最も効く）

- [x] **B1 認可ガード** `@api` — `assertOwner(userId, row)` と認可エラー。先にテスト（一致=通過 / 不一致=403）。FR-10 / SEC-01。`apps/api/src/lib/auth-guard.ts`: `isOwner`/`assertOwner`（HTTPException 403）、`OwnedResource` で汎用化。6ケース緑。
- [x] **B2 slug** `@api` — 生成・正規化・バリデーション・予約語/重複チェックヘルパ。先にテスト。FR-03 / FR-11。`apps/api/src/lib/slug.ts`: `isValidSlug`/`normalizeSlug`/`generateProvisionalSlug`(FNV-1a 決定的)/`ensureUniqueSlug`(述語注入で DB 非依存)、予約語リスト。27ケース緑。
- [x] **B3 sort_order** `@api` — 並び替え（挿入・移動）ロジック。先にテスト。FR-09 / FR-13。`apps/api/src/lib/sort-order.ts`: `moveItem`/`normalizeSortOrders`/`nextSortOrder`/`reorder`(変化分のみ差分)、全て不変。21ケース緑。
- [x] **B4 公開可視判定** `@api` — `is_public === true && status === 'published'` のフィルタ。先にテスト。FR-12。`apps/api/src/lib/visibility.ts`: `isArtworkPublic`/`filterPublicArtworks`(sortOrder昇順・不変)。ArtworkStatus はスキーマ enum 由来。10ケース緑。
- [x] **B5 画像 URL 生成** `@api` — `src/lib/image/`。`/cdn-cgi/image/width=.../<r2_key>` を用途別幅で生成。先にテスト。FR-15 / NFR-03。`apps/api/src/lib/image/url.ts`: `buildImageUrl`/`thumbnailUrl`(400)/`largeUrl`(1600)、純粋（baseUrl 引数）。12ケース緑。
- [x] **B6 R2 署名 URL** `@api` — `src/lib/storage.ts`。aws4fetch で短命・スコープ限定の presigned PUT を組立（鍵はモック）。先にテストで署名入力を検証。NFR-02 / SEC-06。`createStorageClient`(presignPutUrl/objectEndpoint)、`generateR2Key`(乱数注入で推測不能キー)、既定 expiresIn=300、contentType 拘束対応。16ケース緑。
- [x] **B7 検索クエリ組立** `@api` — pg_trgm の類似度/部分一致 SQL フラグメント生成。先にテスト。FR-17 / NFR-05。`apps/api/src/lib/search.ts`: `sanitizeSearchTerm`(LIKE メタ文字エスケープ)/`buildTrigramSearch`(ilike OR、パラメータ束縛)/`buildArtworkSearch`/`buildArtistSearch`。drizzle-orm を api 直接依存に追加(0.45.2 ピン)。20ケース緑（PgDialect で SQL 検証）。

## Phase C — API（Hono RPC）

- [x] **C1 認証マウント + セッション middleware** `@api` — `auth.handler` を `/api/auth/*` に。`getSession` から `user` を載せる middleware（`getSession` はモック）。ADR D6 / FR-01,02。`env.ts`(AppBindings)、`lib/auth.ts`(createAuth: drizzleAdapter+emailAndPassword、verification 不要)、`lib/session.ts`(createSessionMiddleware/requireAuth/getCurrentUser、auth 注入)、index.ts 配線。7ケース緑。Better Auth は本体型定義(v1.6.20)で確認。
- [x] **C2 作品 CRUD** `@api` — `POST/GET/GET:id/PATCH/DELETE /artworks`。全変更系で B1 の所有者検証。リポジトリ層はモック（🔒 実 DB 統合は E2）。FR-05,07,08。`repositories/artwork-repository.ts`(interface + drizzle 実装、型のみ担保)、`routes/artworks.ts`(repo/auth 注入、userId サーバー付与、404→403 順、手動バリデーション)、index.ts 配線。19ケース緑。追加依存なし。
- [x] **C3 画像ルート** `@api` — `POST /uploads/sign`（B6）/ `POST /artworks/:id/images`（メタ作成）/ `DELETE /images/:id` / 並び替え（B3）。FR-06,07。`storage.ts` に `deleteObject` 追加、`image-repository.ts`、`routes/images.ts`(sign/メタ作成/削除時 R2 delete/order 差分)、index.ts 配線。17ケース緑。
- [x] **C3b FR-07 作品削除時の R2 クリーンアップ** `@api` — C2 の `DELETE /artworks/:id` で削除前に当該作品の画像 r2_key を列挙し `storage.deleteObject` で R2 からも削除（DB は FK cascade、R2 は手当が必要）。C2 ルートに imageRepo/storage を注入する小改修。先にテスト（削除時に各 r2_key の deleteObject が呼ばれる）。FR-07。処理順 404→403→listByArtwork→R2 delete→DB delete→204。23ケース緑。
- [x] **C4 公開ポートフォリオ** `@api` — `GET /portfolio/:slug`（未認証、B4 で絞り込み）。FR-11,12,13。`portfolio-repository.ts`(getBySlug、join、型のみ担保)、`routes/portfolio.ts`(B4 可視フィルタ+B5 画像URL、公開DTO、404)。セッション middleware の前に配置（未認証は getSession 不要）。5ケース緑。
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
