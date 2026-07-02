// @artwork/shared — web と api で共有する型・ユーティリティ。
//
// 型共有の方針（ADR D5）:
// - DTO（リクエスト/レスポンス型）はここ（shared）に定義する。api はこれを import し、
//   web も import する。依存方向は web/api → shared の一方向で、循環を作らない。
// - Hono RPC の `AppType`（`typeof app`）は api に依存する性質上 shared には置けない。
//   web は `@artwork/api` から `AppType` を import して `hc<AppType>()` を組む
//   （web → api → shared の一方向。shared → api の逆辺は張らない）。

export const SHARED_PACKAGE = "@artwork/shared" as const;
