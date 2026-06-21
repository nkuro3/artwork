import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import { assertOwner, isOwner } from "./auth-guard";

// B1 認可ガード（FR-10 / SEC-01 / ADR D8）。
// 所有者一致をサーバー側で必ず検証する純ロジックのユニットテスト。
describe("auth-guard", () => {
  describe("isOwner", () => {
    it("所有者が一致するとき true を返す", () => {
      expect(isOwner("user-1", { userId: "user-1" })).toBe(true);
    });

    it("所有者が一致しないとき false を返す", () => {
      expect(isOwner("user-1", { userId: "user-2" })).toBe(false);
    });
  });

  describe("assertOwner", () => {
    it("所有者が一致するとき例外を投げない（通過）", () => {
      expect(() => assertOwner("user-1", { userId: "user-1" })).not.toThrow();
    });

    it("所有者が一致しないとき HTTPException(403) を投げる", () => {
      let thrown: unknown;
      try {
        assertOwner("user-1", { userId: "user-2" });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(HTTPException);
      expect((thrown as HTTPException).status).toBe(403);
    });

    it("所有者列を持つ任意のリソース行を受け付ける", () => {
      const artworkImage = { id: "img-1", userId: "owner", artworkId: "a-1" };
      expect(() => assertOwner("owner", artworkImage)).not.toThrow();
      expect(() => assertOwner("intruder", artworkImage)).toThrow(HTTPException);
    });
  });
});
