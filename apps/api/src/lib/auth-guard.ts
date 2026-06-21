import { HTTPException } from "hono/http-exception";

/**
 * 所有者列を持つリソース行の最小契約。
 * artwork / artwork_image など `user_id` 列を持つ行を汎用的に受ける。
 */
export interface OwnedResource {
  readonly userId: string;
}

/**
 * 現在のユーザーがリソースの所有者かを判定する純関数。
 * テストや条件分岐に使う（例外を投げない）。
 */
export function isOwner(
  currentUserId: string,
  resource: OwnedResource,
): boolean {
  return resource.userId === currentUserId;
}

/**
 * 所有者一致をサーバー側で必ず検証する認可ガード（FR-10 / SEC-01 / ADR D8）。
 * 不一致なら 403 を投げ、一致時は何もせず通過する。
 */
export function assertOwner(
  currentUserId: string,
  resource: OwnedResource,
): void {
  if (!isOwner(currentUserId, resource)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}
