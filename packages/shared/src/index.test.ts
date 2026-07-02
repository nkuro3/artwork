import { describe, expect, it } from "vitest";
import { SHARED_PACKAGE } from "./index";

// ツールチェーン疎通用のスモークテスト（A1）。
describe("@artwork/shared", () => {
  it("パッケージマーカーを公開する", () => {
    expect(SHARED_PACKAGE).toBe("@artwork/shared");
  });
});
