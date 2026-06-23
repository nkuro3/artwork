# プロトタイプ UI（02）タスク台帳

`docs/specs/02-prototype-ui.md`（仕様）を実装に落とす台帳。/loop の駆動対象。1スライス=1イテレーション=1コミット。上から依存順、未完了 `[ ]` の最上位を選んで実装する。

凡例: `[ ]` 未着手 / `[x]` 完了 / `🔒` 外部リソース・認証情報が必要 / `@web` 担当エージェント

依存順: A1 → A2 → B群 → C1（A が基盤、各画面は A に依存、C で横断確認）。ほぼ `@web`・大半がプレゼン層のため視覚は `/verify` で確認する。

## Phase A — 基盤（全画面共通・依存元）

- [x] **A1 デザイン基盤トークン** `@web` — `globals.css` 等に仕様 §4 のトークンを実装（LINE Seed JP 読込 + CSS 変数: フォント / サイズスケール / leading 1.7 / tracking 0.02em / 余白 / 機能色 / フォーカスリング / 角丸 / コンポーネント寸法）。入力・ボタン・チェックボックスの基本スタイル。受入: 全トークンが参照可能・主要フォーム要素に適用・`bun run build:cf` が通る。（§4） ✅ globals.css に CSS 変数(9色+全スケール)+base スタイル、layout で import。LINE Seed JP は安定CDN無のためフォールバック（資産入手後 @font-face で差替）。test93/typecheck/lint/next build 緑。
  - 補足: LINE Seed JP のフォント資産（self-host or CDN）の入手が必要。無ければ system フォールバックで進め、後差し替え可。
- [x] **A2 共通レイアウト/ナビ** `@web` — `layout.tsx` に共通ヘッダー（認証状態別リンク §5.1）+ コンテナ（標準960px / フォーム480px）。状態の共通パターン（loading / empty / error / 404 §5.2）の方針・共通部品。受入: 全ページにヘッダー表示・認証状態別の出し分け・`md` 未満でナビ折返し。（§5.1, §5.2） ✅ `site-header.tsx`(getSession で出し分け、`lib/nav.ts` ロジックはテスト)、layout に main コンテナ、`not-found.tsx`/`error.tsx`、既存ページの二重 main 解消。95件緑/build 緑。

## Phase B — 画面（既存の整備 + 新規）

- [x] **B1 ホーム `/`** `@web` — 未ログイン=ランディング（サービス名 / 説明 / `ログイン`・`登録`）、ログイン済み=`/artworks` へリダイレクト。受入: §6.1 どおり、認証状態でのリダイレクトが動作。 ✅ `page.tsx`(getSession→redirect/ランディング)、`lib/home.ts` の `shouldRedirectHome` をテスト。97件/build 緑。
- [x] **B2 認証画面 整備** `@web` — `/login` `/signup` `/logout` にトークン適用・フォームレイアウト（480px）・状態・文言を整備。受入: §6.2〜6.4。（FR-01） ✅ `components/auth-form.tsx`(AuthShell 480px/AuthField: label+aria-invalid+role=alert)、3画面整備、文言を仕様準拠に修正、ロジックは不変。build 緑。
- [x] **B3 作品一覧/管理 整備** `@web` — グリッド（`md` で2〜3列）・空状態・削除確認・サムネ表示。受入: §6.5。（FR-05, FR-07） ✅ `.artwork-grid`(md2/lg3列)・カード(タイトル/状態/公開可否/編集/削除)・空状態・削除 confirm（既存）。build 緑。**サムネは B3b（api 未対応）に分離**。
- [x] **B3b 作品一覧サムネ対応** `@api`+`@web` — `GET /artworks` の各作品に先頭画像 `thumbnailUrl` を含める（C4/B5 と同様の組み立て・public DTO）。web 一覧でサムネ表示（§6.5）。受入: 一覧に先頭画像サムネが出る。先にテスト（api の DTO 形）。 ✅ api: listByUser 相関サブクエリで先頭 r2_key→B5 で URL 化、`thumbnailUrl: string\|null`（内部 r2Key は非公開）。web: `<img>` 表示（null は出さない・alt=title）。api190/web98/build 緑。
- [x] **B4 作品作成/編集 整備** `@web` — フォームレイアウト・画像アップロード/並び替え UI・状態・編集時プリフィル。受入: §6.6, §6.7。（FR-06, FR-08, FR-09） ✅ `artwork-form.tsx`(480px・label・タイトル必須・二重送信防止)、`image-uploader.tsx`(選択時アップロード・進捗/エラー・↑↓並び替え・削除)、`lib/reorder.ts`(13テスト)、edit の not-found。注: 新規は遅延作成、**編集時の既存画像プリフィルは B4b（api 未対応）**。web111/build 緑。
- [x] **B4b 自分の作品の画像一覧 API + 編集プリフィル** `@api`+`@web` — 認証付き `GET /api/artworks/:id/images`（所有者のみ、下書き含む。先頭からの画像配列 + thumbnailUrl）を追加。web の編集画面で既存画像を表示/削除/並び替え可能に（§6.7）。先にテスト（所有者検証・DTO 形）。受入: 編集で既存画像が出る。 ✅ api: GET /artworks/:id/images（404→403→sort昇順 DTO {id,thumbnailUrl,sortOrder}、r2Key 非公開）+5。web: `getArtworkImages`、edit で initialImages 渡し、既存+新規を統合（削除/並び替え）。api195/web114/build 緑。
- [x] **B5 設定 整備** `@web` — 公開トグル削除（公開制御は作品単位 is_public に統一）・slug / bio・状態・公開ポートフォリオへのリンク。受入: §6.8。（FR-03, FR-11） ✅ 公開トグル除去（フォーム層のみ・api/lib 不変）、設定フォーム整備、`lib/profile-error.ts` で slug 重複/形式エラーを表示先振り分け（5テスト）、/p/{slug} リンク。web119/build 緑。
- [x] **B6 検索結果 `/search`（新規）** `@web` — 検索ボックス + 結果（作品グリッド / 作者リスト）+ 空クエリ/0件 状態。検索 API（C5）を利用。受入: §6.9。データ取得ロジックは先にテスト、画面は `/verify`。（FR-17） ✅ `lib/search.ts` の `searchAll`(空q最適化・正規化、8テスト)、`app/search/page.tsx`(GET フォーム・作品グリッド md2列・作者リンク・空/0件状態)、`.search-grid`。web127/build 緑。**作品→詳細リンクは B6b（DTO に作者slug 無し）**。
- [x] **B6b 検索作品に作者 slug + 詳細リンク** `@api`+`@web` — C5 `SearchArtworkDto` に作者 slug を追加（search-repository で artist_profile.slug を join）。web の検索作品結果を `/p/{artistSlug}/{id}` リンクに。先にテスト（DTO 形）。受入: 検索作品から詳細へ遷移できる。 ✅ api: `SearchArtworkDto.artistSlug`（innerJoin、必須）。web: 検索作品を `<Link href=/p/{artistSlug}/{id}>` に。api195/web127/build 緑。
- [x] **B7 公開ポートフォリオ `/p/[slug]` 整備** `@web` — グリッド（`md` 3列）・bio・レスポンシブ。受入: §6.10。（FR-11〜13, FR-16） ✅ `.portfolio-grid`(`<md`2列/`≥md`3列)・h1 表示名・bio(muted)・サムネ+タイトルを `/p/{slug}/{id}` リンク・空状態。データ取得/cache/SEO は不変。web127/build 緑。
- [x] **B8 公開作品詳細 `/p/[slug]/[artworkId]` 整備** `@web` — 大画像・戻るリンク・レスポンシブ。受入: §6.11。（FR-14, FR-15） ✅ 画像は `largeUrl`（詳細用大・FR-15）を flex 縦並び（複数）・幅100%/アスペクト維持・alt=title、説明(muted)、`{表示名}のポートフォリオへ戻る`(/p/{slug}) を `Link` 化。データ取得/generateMetadata/notFound は不変。web127/build 緑。

## Phase C — 仕上げ

- [x] **C1 レスポンシブ/a11y 横断確認** `@web` — `md` 切替・フォーカスリング・画像 alt・タッチターゲット44px・見出し階層を全画面で確認（`/verify` でブラウザ実機）。受入: §5.4, §5.5 を全画面で満たす。 ✅ ローカル(web:3100→api:8787 Bun サーブ/Neon dev)起動しブラウザ実機確認。**ライブ検証**: home/login/signup/search(空・0件)/404 を <md(700px) と ≥md(1100px) で確認。トークン適用を実測で確定（font=LINE Seed JP, body line-height 30.6px=18×1.7, letter-spacing 0.36px=0.02em, 入力 radius 4px・border #d1d5db, `:focus-visible{outline:2px solid var(--color-focus);offset:2px}` 規則 + ログインボタンにリング可視）。h1 階層・全フォーム label・search landmark・404 文言・空/0件状態を確認。md 切替は matchMedia 実測（700=false/1100=true）。**CSS 確定検証**: グリッド列数を globals.css で §4 表と一致確認（artwork 1→2→3 / portfolio 2→3 / search 1→2、いずれも min-width:768px）。データ依存画面（作品一覧/管理・ポートフォリオ・詳細大画像）は dev DB に公開データが無く、認証/シードは C1 スコープ外のためライブ表示せず、グリッド CSS + build + 既存コードで担保。指摘事項なし。

## 完了の定義（各スライス共通）

1. ロジック（リダイレクト / 検索取得 等）は先にテスト、赤→緑を確認（視覚要素は `/verify`）
2. `bun run test` / `typecheck` / `lint` が緑、`build:cf` が通る
3. 仕様 02 の対応節（§4〜§6）を満たす
4. Conventional Commits で1コミット、本台帳の該当行を `[x]` に更新
