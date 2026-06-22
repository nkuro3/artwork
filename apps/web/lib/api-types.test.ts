import type { AppType } from "@artwork/api";
import { hc } from "hono/client";
import { describe, expectTypeOf, it } from "vitest";

// C5b: `hc<AppType>()` の型レベル回帰スモーク（NFR-11 / ADR D5）。
// 各ルートファクトリをメソッドチェーン化したことで `AppType` に artworks / images /
// uploads / portfolio / search / profile / health の静的型が載る。ここでは「各
// エンドポイントのメソッド/パス/入出力が `hc` 型に存在する」ことをコンパイルで担保する。
// E0: 全 api ルートを /api 配下へ寄せたため、hc のアクセスは `client.api.*` になる（ADR D4）。
// 実行時アサートは置かず、`expectTypeOf`（= tsc）が落ちれば typecheck gate が赤になる。
// fetch は呼ばないため baseUrl は空で良い。

const client = hc<AppType>("");

describe("hc<AppType> 型レベルスモーク", () => {
  it("health: GET /api/health", () => {
    expectTypeOf(client.api.health.$get).toBeFunction();
  });

  it("artworks: 一覧 GET / 作成 POST(json) / 取得・更新(json)・削除 :id", () => {
    expectTypeOf(client.api.artworks.$get).toBeFunction();
    // 作成は json body を受け取る（validator で入力型が載る）。
    expectTypeOf(client.api.artworks.$post)
      .parameter(0)
      .toMatchTypeOf<{ json: { title: string } }>();
    expectTypeOf(client.api.artworks[":id"].$get)
      .parameter(0)
      .toMatchTypeOf<{ param: { id: string } }>();
    // 更新は param + json 双方を受け取る（C5b で json 入力型を復活）。
    expectTypeOf(client.api.artworks[":id"].$patch)
      .parameter(0)
      .toMatchTypeOf<{ param: { id: string }; json: { title?: string } }>();
    expectTypeOf(client.api.artworks[":id"].$delete)
      .parameter(0)
      .toMatchTypeOf<{ param: { id: string } }>();
  });

  it("uploads: 署名 URL 発行 POST(json)", () => {
    expectTypeOf(client.api.uploads.sign.$post)
      .parameter(0)
      .toMatchTypeOf<{ json: { ext: string } }>();
  });

  it("images: メタ作成 POST(param+json) / 削除 :id / 並び替え PATCH(param+json)", () => {
    expectTypeOf(client.api.artworks[":id"].images.$post)
      .parameter(0)
      .toMatchTypeOf<{ param: { id: string }; json: { r2Key: string } }>();
    expectTypeOf(client.api.images[":id"].$delete)
      .parameter(0)
      .toMatchTypeOf<{ param: { id: string } }>();
    expectTypeOf(client.api.artworks[":id"].images.order.$patch)
      .parameter(0)
      .toMatchTypeOf<{
        param: { id: string };
        json: { orderedIds: string[] };
      }>();
  });

  it("portfolio: 公開取得 GET /api/portfolio/:slug", () => {
    expectTypeOf(client.api.portfolio[":slug"].$get)
      .parameter(0)
      .toMatchTypeOf<{ param: { slug: string } }>();
  });

  it("search: 公開検索 GET /api/search", () => {
    expectTypeOf(client.api.search.$get).toBeFunction();
  });

  it("profile: 取得 GET / 更新 PATCH(json)", () => {
    expectTypeOf(client.api.profile.$get).toBeFunction();
    expectTypeOf(client.api.profile.$patch).toBeFunction();
  });
});
